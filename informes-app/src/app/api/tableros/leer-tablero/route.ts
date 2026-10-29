import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { registrarUsoIa } from "@/lib/ai/registrar-uso";
import { TABLERO_FOTO_IA_MAX } from "@/components/tableros/types";
import {
  leerTablero,
  limpiarLecturaTablero,
  controlarLecturaTablero,
  adaptarACircuitosDelMotor,
  LecturaTableroError,
} from "@/lib/tableros/leer-tablero";

/**
 * Lectura "detallada" de un tablero de térmicas/disyuntores en una sola
 * llamada (docs/lectura-fotos/ENCARGO.md, repo cidenisar/motor-unifilar,
 * rama lectura-fotos). Complementa a /api/tableros/leer-foto (que sigue
 * sin cambios, cubre cualquier tipo de equipamiento mixto) con una lectura
 * más profunda pensada específicamente para tableros de energía con pares
 * térmica+disyuntor: recorta cada foto en mitades ampliadas para no perder
 * calibres chicos, y nunca inventa un calibre que no se lee (ver
 * REGLAS_LECTURA.md) — el técnico revisa y corrige igual que con el otro
 * botón, en la misma tabla de circuitos.
 */

const MODELO = "claude-opus-5-5";

async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-tablero-detallado-ia",
      mensaje: mensaje.slice(0, 2000),
      stack: extra ? extra.slice(0, 4000) : null,
    });
  } catch {
    // el diagnóstico es best-effort, nunca debe romper la respuesta real
  }
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "La lectura de fotos con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const formData = await req.formData();
  const files = formData.getAll("fotos").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Falta al menos una foto." }, { status: 400 });
  }
  if (files.length > TABLERO_FOTO_IA_MAX) {
    return NextResponse.json({ error: `Máximo ${TABLERO_FOTO_IA_MAX} fotos por lectura.` }, { status: 400 });
  }

  const fotos = await Promise.all(
    files.map(async (f, i) => ({ buffer: Buffer.from(await f.arrayBuffer()), nombre: f.name || `foto-${i + 1}` })),
  );

  try {
    const { json: crudo, uso } = await leerTablero(fotos, MODELO);
    await registrarUsoIa(supabase, {
      endpoint: "tableros/leer-tablero",
      modulo: "tableros",
      modelo: uso.modelo,
      inputTokens: uso.inputTokens,
      outputTokens: uso.outputTokens,
      userId: profile.id,
    });

    if (crudo.circuitos.length === 0) {
      await logDiagnostico(supabase, profile.id, "leer-tablero: la IA devolvió 0 circuitos");
      return NextResponse.json({ error: "No se detectó ningún circuito en las fotos." }, { status: 200 });
    }

    const json = limpiarLecturaTablero(crudo);
    const controles = controlarLecturaTablero(json);
    const circuitos = adaptarACircuitosDelMotor(json);

    // Fase 3 (ENCARGO.md): registro de la lectura — fotos + JSON crudo, para
    // poder listar costo por tablero/mes y medir el % de acierto cuando el
    // técnico guarde la medición (ver tablero_lecturas_ia). Se guarda ACÁ
    // (no recién al guardar) porque es el único momento en que tenemos el
    // JSON crudo real — si el técnico abandona sin guardar, la fila queda
    // sin tablero_id/medicion_id, pero el costo real igual quedó registrado.
    let lecturaId: string | null = null;
    const fotosUrls: string[] = [];
    for (let i = 0; i < fotos.length; i++) {
      const fotoPath = `${profile.id}/tableros/lecturas-ia/${crypto.randomUUID()}.jpg`;
      const { error: fotoUpErr } = await supabase.storage
        .from("informe-fotos")
        .upload(fotoPath, fotos[i].buffer, { contentType: "image/jpeg", upsert: true });
      if (!fotoUpErr) fotosUrls.push(fotoPath);
    }
    const { data: lecturaRow } = await supabase
      .from("tablero_lecturas_ia")
      .insert({
        fotos_urls: fotosUrls,
        modelo: uso.modelo,
        input_tokens: uso.inputTokens,
        output_tokens: uso.outputTokens,
        costo_estimado_usd: uso.costoUsd,
        json_crudo: json as unknown as Record<string, unknown>,
        circuitos_adaptados: circuitos as unknown as unknown[],
        created_by: profile.id,
      })
      .select("id")
      .single();
    lecturaId = lecturaRow?.id ?? null;

    return NextResponse.json({ circuitos, controles, uso, observaciones: json.observaciones, lecturaId });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    if (err instanceof LecturaTableroError) {
      await logDiagnostico(supabase, profile.id, `leer-tablero: ${detalle}`);
      return NextResponse.json({ error: "La IA no devolvió un tablero reconocible — probá con otras fotos o cargá los circuitos a mano." }, { status: 502 });
    }
    await logDiagnostico(supabase, profile.id, `leer-tablero: error contactando la API de Anthropic — ${detalle}`);
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "La clave de IA configurada no es válida — avisá a un Administrador." }, { status: 502 });
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json(
        { error: "La cuenta de IA no tiene permiso o crédito disponible para esta operación — avisá a un Administrador." },
        { status: 502 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "El servicio de IA está saturado en este momento — probá de nuevo en un minuto." }, { status: 502 });
    }
    if (err instanceof Anthropic.APIError && (err.status === 400 || err.status === 402) && /credit|billing|quota/i.test(detalle)) {
      return NextResponse.json({ error: "La cuenta de IA no tiene crédito disponible — avisá a un Administrador para recargarla." }, { status: 502 });
    }
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
