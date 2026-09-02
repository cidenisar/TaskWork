import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";

/**
 * "Mejorar con IA" (spec sección 6.1 / 10, funcionalidad #1): corrige ortografía
 * y gramática y sube el tono a uno profesional, sin inventar información nueva.
 */
export async function POST(request: Request) {
  const profile = await requireProfile();
  if (!profile) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { texto } = (await request.json().catch(() => ({}))) as { texto?: string };
  if (!texto || !texto.trim()) {
    return NextResponse.json({ error: "No hay texto para mejorar." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "La mejora con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "low" },
      system:
        "Corregís ortografía y gramática de descripciones de trabajos técnicos de campo (informes técnicos) " +
        "y subís el tono a uno profesional. Nunca inventes ni agregues información que no esté en el texto " +
        "original — solo reescribís lo que ya está. Respondé únicamente con el texto corregido, sin comillas, " +
        "sin explicaciones ni comentarios adicionales.",
      messages: [{ role: "user", content: texto }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      return NextResponse.json({ error: "No se pudo mejorar el texto." }, { status: 502 });
    }

    return NextResponse.json({ mejorado: textBlock.text.trim() });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
