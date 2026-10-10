import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Escaneo puntual de UN solo campo (etiqueta YPF o N° de serie) de un
 * equipo de rack, con una sola foto de cerca — para completar lo que la
 * lectura general (leer-foto, con hasta 14 fotos combinadas) no llegó a
 * leer. Mismo motor (Claude Vision) que el resto de la app, pero acotado a
 * un solo campo para que sea rápido y barato.
 */

const CAMPOS = {
  etiquetaYpf: {
    nombre: "etiqueta/chapa de INVENTARIO DE YPF",
    detalle:
      "suele ser un sticker o chapa metálica con un código numérico pegada por YPF — distinta de la etiqueta de serie de fábrica del " +
      "fabricante.",
  },
  numeroSerie: {
    nombre: "N° de serie de fábrica",
    detalle:
      'el que imprime el FABRICANTE del equipo en su etiqueta (ej. "S/N: ABC123456" o "Serial Number") — distinto de la chapa de ' +
      "inventario de YPF.",
  },
} as const;

type Campo = keyof typeof CAMPOS;

async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-campo-rack-ia",
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
  const foto = formData.get("foto");
  const campo = formData.get("campo");
  if (!(foto instanceof File)) {
    return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  }
  if (typeof campo !== "string" || !(campo in CAMPOS)) {
    return NextResponse.json({ error: "Campo inválido." }, { status: 400 });
  }
  const { nombre, detalle } = CAMPOS[campo as Campo];

  const base64 = Buffer.from(await foto.arrayBuffer()).toString("base64");
  const mediaType = (foto.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 300,
      output_config: { effort: "low" },
      system:
        `Sos un asistente que ayuda a un técnico a leer de cerca ${nombre} de un equipo (${detalle}) a partir de una foto. ` +
        'Respondé ÚNICAMENTE con un JSON válido {"valor": string | null} — el texto leído tal cual aparece (sin inventar ni ' +
        "completar caracteres que no se vean con claridad), o null si la foto no muestra esa etiqueta o no es legible. Sin texto " +
        "antes ni después, sin bloque de código markdown.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: `Leeme ${nombre} de esta foto.` },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `leer-campo (${campo}): stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo leer la foto." }, { status: 502 });
    }

    let valor: unknown;
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      ({ valor } = JSON.parse(match ? match[0] : textBlock.text));
    } catch {
      await logDiagnostico(supabase, profile.id, `leer-campo (${campo}): la respuesta no fue JSON parseable`, textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió algo reconocible — probá con otra foto." }, { status: 502 });
    }

    return NextResponse.json({ valor: typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 60) : null });
  } catch (err) {
    const detalle2 = err instanceof Error ? err.message : String(err);
    await logDiagnostico(supabase, profile.id, `leer-campo (${campo}): error contactando la API de Anthropic — ${detalle2}`);
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
    if (err instanceof Anthropic.APIError && (err.status === 400 || err.status === 402) && /credit|billing|quota/i.test(detalle2)) {
      return NextResponse.json(
        { error: "La cuenta de IA no tiene crédito disponible — avisá a un Administrador para recargarla." },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
