import { NextRequest, NextResponse } from "next/server";
import { crearMensajeIa, hayAlgunaIaConfigurada, mensajeErrorIa } from "@/lib/ai/motor";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SALA_FOTO_GENERAL_MAX, SALA_TIPO_CONSTRUCCION_LABEL, SALA_TIPO_CONSTRUCCION_OPCIONES } from "@/components/salas/types";
import type { SalaTipoConstruccion } from "@/lib/database.types";
import { instruccionInspeccionIa, INSTRUCCION_RESPUESTA_HALLAZGOS, parseHallazgosDetectados } from "@/lib/inspeccion-ia/prompt";
import { verificarLimiteIa } from "@/lib/ai/rate-limit";

/**
 * Inspección IA de una Sala / Shelter / Container: mira las fotos y detecta qué hay para REPARAR o
 * MEJORAR. Hace dos cosas con las mismas fotos:
 *  1. evalúa el catálogo de puntos de inspección del módulo "salas" (Configuración → Catálogos), uno
 *     por uno: se ve el problema / no se ve / no se puede evaluar;
 *  2. lista aparte lo que note y no esté en esa lista ("observaciones").
 * La IA nunca escribe en la base: devuelve una propuesta y quien releva confirma o corrige.
 */

const MAX_OBSERVACIONES = 8;

async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-foto-sala-ia",
      mensaje: mensaje.slice(0, 2000),
      stack: extra ? extra.slice(0, 4000) : null,
    });
  } catch {
    // el diagnóstico es best-effort
  }
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!hayAlgunaIaConfigurada()) {
    return NextResponse.json({ error: "La lectura de fotos con IA no está configurada en este entorno (falta la clave de alguna IA)." }, { status: 503 });
  }
  const limite = await verificarLimiteIa(supabase, profile.id);
  if (!limite.permitido) return NextResponse.json({ error: limite.error }, { status: 429 });

  const formData = await req.formData();
  const files = formData.getAll("fotos").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Falta al menos una foto." }, { status: 400 });
  if (files.length > SALA_FOTO_GENERAL_MAX) return NextResponse.json({ error: `Máximo ${SALA_FOTO_GENERAL_MAX} fotos por lectura.` }, { status: 400 });

  const tipoRaw = formData.get("tipoConstruccion");
  const tipo = typeof tipoRaw === "string" && (SALA_TIPO_CONSTRUCCION_OPCIONES as string[]).includes(tipoRaw) ? (tipoRaw as SalaTipoConstruccion) : null;

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  const { data: catalogo } = await supabase.from("catalogo_inspeccion_ia").select("id, texto").eq("modulo", "salas").order("orden");
  const hallazgosItems = catalogo ?? [];
  const instruccionHallazgos = instruccionInspeccionIa(hallazgosItems);

  const contexto =
    `Es ${tipo ? `un/a ${SALA_TIPO_CONSTRUCCION_LABEL[tipo].toLowerCase()}` : "una sala técnica, shelter o container"} de una instalación de ` +
    "energía y comunicaciones (equipos de radio, UPS, baterías, tableros, racks, aire acondicionado). " +
    (imagenes.length > 1 ? `Te paso ${imagenes.length} fotos de la MISMA sala (distintos ángulos): combinalas como una sola inspección.` : "");

  try {
    const response = await crearMensajeIa(supabase, { endpoint: "salas/leer-foto", modulo: "salas", userId: profile.id }, {
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 4096,
      output_config: { effort: "medium" },
      system:
        "Sos un inspector técnico que ayuda a un técnico de campo a detectar qué hay para REPARAR o MEJORAR en una sala técnica, " +
        `shelter o container. ${contexto}\n\n` +
        "Reglas generales: describí SOLO lo que se ve en las fotos; nunca inventes un problema que no puedas justificar por la imagen, " +
        "y si una zona no aparece en ninguna foto no la juzgues. Es una propuesta para que una persona la revise, no un dictamen." +
        `${instruccionHallazgos}\n\n` +
        `Además, en "observaciones" listá (hasta ${MAX_OBSERVACIONES}) otras cosas concretas para reparar o mejorar que veas y que NO estén ` +
        "cubiertas por los puntos de la lista anterior: una frase corta y accionable cada una (qué es y dónde, ej. \"Cable de datos " +
        'colgando frente al rack, falta canalizarlo"). Array vacío [] si no ves nada más. No repitas lo ya cubierto por la lista.\n\n' +
        `Respondé ÚNICAMENTE con un JSON válido: {"hallazgos": [...], "observaciones": [string]} donde ${INSTRUCCION_RESPUESTA_HALLAZGOS}. ` +
        "Sin texto antes ni después, sin bloque de código markdown.",
      messages: [
        {
          role: "user",
          content: [
            ...imagenes.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
            })),
            { type: "text", text: "Inspeccioná esta sala/shelter y decime qué hay para reparar o mejorar." },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `leer-foto: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo leer la foto." }, { status: 502 });
    }

    let parsed: { hallazgos?: unknown[]; observaciones?: unknown };
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-foto: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió una respuesta reconocible — probá con otras fotos." }, { status: 502 });
    }

    const observaciones = (Array.isArray(parsed.observaciones) ? parsed.observaciones : [])
      .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      .map((o) => o.trim().slice(0, 240))
      .slice(0, MAX_OBSERVACIONES);

    return NextResponse.json({
      hallazgos: parseHallazgosDetectados(parsed.hallazgos, hallazgosItems),
      observaciones,
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await logDiagnostico(supabase, profile.id, `leer-foto: error contactando a la IA — ${detalle}`);
    return NextResponse.json({ error: mensajeErrorIa(err) }, { status: 502 });
  }
}
