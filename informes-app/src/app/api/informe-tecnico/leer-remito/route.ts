import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Lee UNA foto del remito en papel que entrega el depósito (distinto de
 * leer-foto de materiales: acá no se identifica un objeto físico, se lee
 * una lista/tabla — impresa o manuscrita) y devuelve el N° de remito (si es
 * legible) más cada línea con su descripción y cantidad. Es la lista
 * "esperada" para la sección Materiales de Informe Técnico — el técnico la
 * revisa, y lo que no termine usado/instalado queda como sobrante para la
 * devolución automática a depósito.
 */

interface LineaDetectada {
  descripcion: string;
  cantidad: number;
}

/** Mismo criterio que el resto de los endpoints de lectura con IA: deja registro en Configuración → Errores del dispositivo, nunca corta la respuesta. */
async function logDiagnostico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mensaje: string,
  extra?: string,
) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-remito-informe-tecnico-ia",
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
  const file = formData.get("foto");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta la foto del remito." }, { status: 400 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mediaType = (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: { effort: "medium" },
      system:
        "Sos un asistente que ayuda a un técnico a cargar el remito en papel que le entregó el depósito junto con los materiales " +
        "que retiró (impreso o escrito a mano, a veces con mala letra o mala foto). Tu trabajo es transcribir la lista de materiales " +
        "del remito — NO identificar objetos en una foto de equipamiento, acá hay texto/una tabla para leer.\n\n" +
        'Devolvé "remitoNumero": el número del remito si está impreso o escrito en algún lugar del documento (ej. "0001-00004521"), ' +
        'o null si no lo encontrás o no es legible con certeza — no inventes un número.\n\n' +
        'Devolvé "items": un array con cada línea de material/producto de la lista, cada uno con:\n' +
        '- "descripcion": el texto de esa línea tal cual se lee (ej. "Cámara domo IP 4MP", "UPS 1500VA"). Transcribí lo que dice, no ' +
        "lo reinterpretes ni resumas de más. Si una línea no se entiende ni parcialmente, no la inventes — omitila.\n" +
        '- "cantidad": el número de esa línea si está escrito (columna de cantidad/cant./unid.). Si no hay un número para esa línea, ' +
        "usá 1.\n\n" +
        "No inventes líneas que no estén en el remito, y no completes de memoria algo que la foto no deja ver con claridad. Si la " +
        "foto no muestra ningún remito o lista legible, devolvé un array vacío en \"items\".\n\n" +
        'Respondé ÚNICAMENTE con un JSON válido: {"remitoNumero": string | null, "items": [{"descripcion": string, "cantidad": ' +
        "number}]}, sin texto antes ni después, sin bloque de código markdown.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: base64 } },
            { type: "text", text: "Transcribime este remito." },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `leer-remito: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo leer el remito." }, { status: 502 });
    }

    let parsed: { remitoNumero: string | null; items: LineaDetectada[] };
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-remito: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no pudo leer el remito — probá con otra foto o cargá la lista a mano." }, { status: 502 });
    }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    if (items.length === 0) {
      await logDiagnostico(supabase, profile.id, "leer-remito: la IA no detectó líneas", textBlock.text);
      return NextResponse.json({ error: "No se reconoció ninguna línea en el remito — probá con otra foto o cargá la lista a mano." }, { status: 200 });
    }

    return NextResponse.json({
      remitoNumero: typeof parsed.remitoNumero === "string" && parsed.remitoNumero.trim() ? parsed.remitoNumero.trim().slice(0, 60) : null,
      items: items
        .filter((it) => it && typeof it.descripcion === "string" && it.descripcion.trim())
        .map((it) => ({
          descripcion: String(it.descripcion).trim().slice(0, 160),
          cantidad: Number.isFinite(it.cantidad) && it.cantidad > 0 ? Math.round(it.cantidad) : 1,
        })),
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await logDiagnostico(supabase, profile.id, `leer-remito: error contactando la API de Anthropic — ${detalle}`);
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
