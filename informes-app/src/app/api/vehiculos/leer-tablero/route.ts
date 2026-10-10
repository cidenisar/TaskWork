import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VEHICULO_TABLERO_FOTO_MAX } from "@/components/panel/vehiculos/alta-types";

/**
 * Lee fotos del TABLERO/odómetro de un vehículo para completar el
 * kilometraje al dar de alta — el Admin revisa y corrige antes de guardar.
 * Mismo criterio que la patente en leer-exterior: el kilometraje es un
 * número que tiene que ser exacto, así que si los dígitos no se leen con
 * total claridad se devuelve null en vez de adivinar.
 */

interface TableroDetectado {
  kilometraje: number | null;
  identificado: boolean;
}

async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-tablero-vehiculo-ia",
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
  if (files.length > VEHICULO_TABLERO_FOTO_MAX) {
    return NextResponse.json({ error: `Máximo ${VEHICULO_TABLERO_FOTO_MAX} fotos por lectura.` }, { status: 400 });
  }

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: { effort: "high" },
      system:
        "Sos un asistente que ayuda a dar de alta un vehículo de una flota de trabajo — te paso una o más fotos del TABLERO del " +
        "vehículo (odómetro, display digital o mecánico de kilometraje).\n\n" +
        'Completá estos campos:\n' +
        '- "kilometraje": el número de kilometraje EXACTO tal como se lee en el odómetro, como entero (ej. 84500, no "84.500" ni ' +
        '"84,500 km"). Esto es crítico: si el display está apagado, borroso, con reflejo, cortado, o no podés leer CADA dígito con ' +
        'certeza, devolvé null — NUNCA completes ni redondees dígitos que no podés leer, un kilometraje mal leído es peor que uno vacío.\n' +
        '- "identificado": true solo si "kilometraje" viene de una lectura completa y clara de todos los dígitos, false en cualquier ' +
        "otro caso (incluido cuando devolviste null).\n\n" +
        'Respondé ÚNICAMENTE con un JSON válido: un objeto {"kilometraje": number | null, "identificado": boolean}, sin texto antes ni ' +
        "después, sin bloque de código markdown.",
      messages: [
        {
          role: "user",
          content: [
            ...imagenes.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
            })),
            { type: "text", text: "Leeme el kilometraje del odómetro en esta foto del tablero." },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `leer-tablero: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo leer la foto." }, { status: 502 });
    }

    let detectado: TableroDetectado;
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      detectado = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-tablero: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió un dato reconocible — probá con otra foto o cargá el kilometraje a mano." }, { status: 502 });
    }

    return NextResponse.json({
      kilometraje: Number.isFinite(detectado.kilometraje) && (detectado.kilometraje as number) >= 0 ? Math.round(detectado.kilometraje as number) : null,
      identificado: detectado.identificado === true,
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
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
      return NextResponse.json(
        { error: "La cuenta de IA no tiene crédito disponible — avisá a un Administrador para recargarla." },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
