import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { puedeVerEstadisticas } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { getEstadisticasBase } from "@/lib/estadisticas/aggregates";

/**
 * Insights automáticos (spec sección 8.4 / 10 #5): pre-calculamos números
 * reales server-side (aggregates.ts) y le pedimos a Claude que los redacte
 * en 3-5 observaciones en lenguaje natural — nunca que invente cifras.
 */
export async function GET() {
  const profile = await requireProfile();
  if (!puedeVerEstadisticas(profile.rol)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const supabase = await createClient();
  const { insightsContext } = await getEstadisticasBase(supabase);

  const tieneDatos =
    insightsContext.gastosPorCategoriaMesActual.length > 0 ||
    insightsContext.pctSeguridadMesActual != null ||
    insightsContext.ubicacionesRepetidas.length > 0 ||
    insightsContext.rendicionesAbiertasHaceMucho.length > 0;

  if (!tieneDatos) {
    return NextResponse.json({
      insights: ["Todavía no hay suficientes informes o gastos cargados este mes para generar observaciones."],
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Los insights automáticos no están configurados en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: { effort: "low" },
      system:
        "Sos un analista que redacta observaciones cortas en español (Argentina) sobre la actividad de un equipo " +
        "de técnicos de campo, a partir de datos ya agregados que te paso en JSON. Reglas: (1) usá SOLO los números " +
        "del JSON, nunca inventes cifras ni datos que no estén ahí; (2) generá entre 3 y 5 observaciones, una por " +
        "línea, cada una arrancando con un emoji relevante (⚠️ para alertas de gasto, 🦺 para seguridad, 📍 para " +
        "ubicaciones repetidas, 💰 para rendiciones sin cerrar, u otro que corresponda); (3) si un dato no cambió o " +
        "no hay suficiente información para una categoría, simplemente omitila — no fuerces una observación por " +
        "categoría; (4) tono profesional y directo, una oración por observación; (5) respondé SOLO con las " +
        "observaciones, una por línea, sin numerarlas ni agregar texto antes o después.",
      messages: [{ role: "user", content: JSON.stringify(insightsContext) }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      return NextResponse.json({ error: "No se pudieron generar los insights." }, { status: 502 });
    }
    const insights = textBlock.text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    return NextResponse.json({ insights });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
