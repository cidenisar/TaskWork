import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { puedeVerEstadisticas } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { ESTADISTICAS_TOOLS, ejecutarHerramienta } from "@/lib/estadisticas/tools";

const SYSTEM_PROMPT =
  "Sos un asistente que responde preguntas sobre informes técnicos y rendiciones de gastos de un equipo de " +
  "campo, usando EXCLUSIVAMENTE las herramientas de consulta agregada que tenés disponibles — nunca inventes " +
  "números que no vengan de una herramienta. Si la pregunta no se puede responder con las herramientas " +
  "disponibles, decilo claramente en vez de adivinar. Respondé en español (Argentina), en 1-3 oraciones, yendo " +
  "directo al dato concreto.";

const MAX_TURNS = 4;

/**
 * Asistente en lenguaje natural (spec sección 8.5 / 10 #6): tool-use real
 * contra consultas agregadas — nunca acceso de escritura ni filas crudas.
 */
export async function POST(request: Request) {
  const profile = await requireProfile();
  if (!puedeVerEstadisticas(profile.rol)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { pregunta } = (await request.json().catch(() => ({}))) as { pregunta?: string };
  if (!pregunta || !pregunta.trim()) {
    return NextResponse.json({ error: "Escribí una pregunta." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "El asistente no está configurado en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const supabase = await createClient();
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: pregunta }];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 1024,
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        tools: ESTADISTICAS_TOOLS,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return NextResponse.json({ error: "No se pudo responder la pregunta." }, { status: 502 });
      }

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find((b) => b.type === "text");
        return NextResponse.json({ respuesta: textBlock?.text.trim() || "No pude generar una respuesta." });
      }

      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await ejecutarHerramienta(supabase, block.name, block.input as Record<string, unknown>);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({ error: "No se pudo responder en el tiempo esperado." }, { status: 504 });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
