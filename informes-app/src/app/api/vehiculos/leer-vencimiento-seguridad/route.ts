import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { registrarUsoIa } from "@/lib/ai/registrar-uso";
import { verificarLimiteIa } from "@/lib/ai/rate-limit";

/**
 * Lee la fecha de vencimiento impresa en la etiqueta del matafuego o del
 * botiquín de un vehículo, desde una foto — usado en el control periódico
 * del celu (nueva-control-form.tsx). El técnico siempre puede revisar y
 * corregir el resultado antes de guardar: esto nunca escribe directo a la
 * base. Mismo criterio que leer-tablero (kilometraje): si la fecha no se ve
 * con total claridad, se devuelve null en vez de adivinar.
 */

type TipoEtiqueta = "matafuego" | "botiquin";

const ETIQUETA_LABEL: Record<TipoEtiqueta, string> = {
  matafuego: "matafuego (extintor)",
  botiquin: "botiquín de primeros auxilios",
};

interface VencimientoDetectado {
  fecha: string | null;
  identificado: boolean;
}

async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-vencimiento-seguridad-vehiculo-ia",
      mensaje: mensaje.slice(0, 2000),
      stack: extra ? extra.slice(0, 4000) : null,
    });
  } catch {
    // el diagnóstico es best-effort, nunca debe romper la respuesta real
  }
}

function esFechaValida(fecha: unknown): fecha is string {
  return typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "La lectura de fotos con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const limite = await verificarLimiteIa(supabase, profile.id);
  if (!limite.permitido) {
    return NextResponse.json({ error: limite.error }, { status: 429 });
  }

  const formData = await req.formData();
  const tipoRaw = formData.get("tipo");
  if (tipoRaw !== "matafuego" && tipoRaw !== "botiquin") {
    return NextResponse.json({ error: "Tipo de etiqueta inválido." }, { status: 400 });
  }
  const tipo = tipoRaw;

  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    return NextResponse.json({ error: "Falta la foto de la etiqueta." }, { status: 400 });
  }

  const imagen = {
    base64: Buffer.from(await foto.arrayBuffer()).toString("base64"),
    mediaType: (foto.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
  };

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 512,
      output_config: { effort: "high" },
      system:
        `Sos un asistente que ayuda a controlar la seguridad de un vehículo de una flota de trabajo — te paso una foto de la etiqueta ` +
        `o cartel del ${ETIQUETA_LABEL[tipo]}, que suele tener impresa o escrita a mano una fecha de vencimiento, recarga o próximo ` +
        'control.\n\n' +
        'Completá:\n' +
        '- "fecha": la fecha de VENCIMIENTO (no la de fabricación ni la de la última recarga, salvo que sea la única que haya) en ' +
        'formato "YYYY-MM-DD". Si en la etiqueta solo se distingue mes y año (sin día), usá el último día de ese mes. Si no hay ' +
        'ninguna fecha visible, o está borrosa/tapada/ilegible, devolvé null — NUNCA inventes ni redondees una fecha que no podés leer ' +
        'con certeza.\n' +
        '- "identificado": true solo si "fecha" viene de una lectura clara, false en cualquier otro caso (incluido cuando devolviste ' +
        'null).\n\n' +
        'Respondé ÚNICAMENTE con un JSON válido: {"fecha": string | null, "identificado": boolean}, sin texto antes ni después, sin ' +
        'bloque de código markdown.',
      messages: [
        {
          role: "user",
          content: [
            { type: "image" as const, source: { type: "base64" as const, media_type: imagen.mediaType, data: imagen.base64 } },
            { type: "text", text: `Leeme la fecha de vencimiento de esta etiqueta de ${ETIQUETA_LABEL[tipo]}.` },
          ],
        },
      ],
    });

    await registrarUsoIa(supabase, {
      endpoint: "vehiculos/leer-vencimiento-seguridad",
      modulo: "vehiculos",
      modelo: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      userId: profile.id,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `leer-vencimiento-seguridad: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo leer la foto." }, { status: 502 });
    }

    let detectado: Partial<VencimientoDetectado>;
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      detectado = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-vencimiento-seguridad: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió un dato reconocible — probá con otra foto o cargá la fecha a mano." }, { status: 502 });
    }

    return NextResponse.json({
      fecha: esFechaValida(detectado.fecha) ? detectado.fecha : null,
      identificado: detectado.identificado === true,
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await logDiagnostico(supabase, profile.id, `leer-vencimiento-seguridad: error contactando la API de Anthropic — ${detalle}`);
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
