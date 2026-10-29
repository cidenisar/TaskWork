import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { registrarUsoIa } from "@/lib/ai/registrar-uso";

/** Tope de fotos de evidencia que se mandan a esta verificación — más que esto no suma precisión y encarece/alenta la llamada. */
const FOTOS_VERIFICACION_MAX = 15;

interface ItemAVerificar {
  key: string;
  descripcion: string;
}

/**
 * Contraste al revés del habitual: en vez de preguntarle a la IA "¿qué hay
 * en la foto que no está en la lista?", parte de la lista de materiales/
 * remito que el técnico ya cargó como usado/instalado y le pregunta, ítem
 * por ítem, "¿esto se ve instalado en alguna de las fotos de evidencia del
 * trabajo?" — el riesgo típico acá es el falso negativo (un material que
 * SÍ está pero queda chico/oculto/mal encuadrado en la foto), por eso el
 * resultado es siempre una sugerencia para que el técnico revise antes de
 * guardar, nunca un bloqueo.
 */
async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "verificar-instalacion-informe-tecnico-ia",
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
    return NextResponse.json({ error: "La verificación con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const formData = await req.formData();
  const files = formData.getAll("fotos").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Falta al menos una foto de evidencia." }, { status: 400 });
  }
  if (files.length > FOTOS_VERIFICACION_MAX) {
    return NextResponse.json({ error: `Máximo ${FOTOS_VERIFICACION_MAX} fotos por verificación.` }, { status: 400 });
  }

  let items: ItemAVerificar[];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return NextResponse.json({ error: "Lista de materiales inválida." }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "No hay materiales/remito cargados para verificar." }, { status: 400 });
  }

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  const listado = items.map((it, i) => `${i + 1}. [clave: ${it.key}] ${it.descripcion}`).join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      output_config: { effort: "medium" },
      system:
        "Te paso las fotos de evidencia del trabajo que un técnico de campo sacó al terminar una instalación/reparación, y la lista de " +
        "materiales/equipos que ese técnico cargó como usados en el trabajo. Tu tarea es, para CADA ítem de la lista, decir si se ve " +
        "instalado/presente en AL MENOS UNA de las fotos.\n\n" +
        "Sé conservador antes de marcar un ítem como NO visto: una foto borrosa, un ángulo parcial, un material chico, o algo " +
        "parcialmente oculto detrás de otra cosa puede estar perfectamente instalado aunque no se note a primera vista — marcalo como " +
        "visto si hay evidencia razonable de que SÍ podría ser ese objeto, aunque no sea 100% nítido. Marcá \"visto\": false solo " +
        "cuando de verdad no encuentres ningún indicio de ese material en ninguna foto. Nunca inventes haber visto algo que no está.\n\n" +
        `Lista de materiales/equipos cargados:\n${listado}\n\n` +
        'Respondé ÚNICAMENTE con un JSON válido: un array de objetos {"key": string, "visto": boolean}, uno por cada ítem de la ' +
        "lista (mismas claves, mismo orden), sin texto antes ni después, sin bloque de código markdown.",
      messages: [
        {
          role: "user",
          content: [
            ...imagenes.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
            })),
            {
              type: "text",
              text: `Estas son las ${imagenes.length} fotos de evidencia del trabajo. Decime, para cada ítem de la lista, si se ve instalado.`,
            },
          ],
        },
      ],
    });

    await registrarUsoIa(supabase, {
      endpoint: "informe-tecnico/verificar-instalacion",
      modulo: "informe_tecnico",
      modelo: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      userId: profile.id,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `verificar-instalacion: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo verificar la instalación." }, { status: 502 });
    }

    let resultados: { key: string; visto: boolean }[];
    try {
      const match = textBlock.text.match(/\[[\s\S]*\]/);
      resultados = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "verificar-instalacion: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "No se pudo interpretar la respuesta de la IA." }, { status: 502 });
    }
    if (!Array.isArray(resultados)) {
      return NextResponse.json({ error: "No se pudo interpretar la respuesta de la IA." }, { status: 502 });
    }

    return NextResponse.json({ resultados });
  } catch (err) {
    await logDiagnostico(supabase, profile.id, err instanceof Error ? err.message : "Error desconocido verificando instalación", err instanceof Error ? err.stack : undefined);
    return NextResponse.json({ error: "No se pudo verificar la instalación." }, { status: 502 });
  }
}
