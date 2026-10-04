"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";
import { CATEGORIA_EQUIPO_LABEL as EQUIPO_CATEGORIA_LABEL } from "@/components/equipos/types";

export interface EstimarConsumoResult {
  success: boolean;
  error?: string;
  estimados?: number;
  sinDato?: number;
}

interface Watts {
  promedio: number | null;
  max: number | null;
}

/**
 * Backfill de "Consumo estimado (IA)" para equipamiento que ya estaba
 * cargado antes de que existiera este campo (o para el que la IA no pudo
 * estimar en el momento del relevamiento). Un solo pedido a Claude con
 * TODOS los ítems pendientes de un sitio — más barato y rápido que uno por
 * ítem — pide promedio y máximo por cada uno, en el mismo orden. Solo
 * texto (categoría + marca/modelo ya identificados), sin fotos: la
 * estimación es por conocimiento general de ese modelo, no por lo que se
 * ve en una imagen. Pide los dos valores por separado — un solo número
 * confundía el vatiaje nominal de la fuente/cargador del equipo con lo que
 * en los hechos consume en uso normal (ej. una notebook con cargador de
 * 65W consume mucho menos que eso la mayoría del tiempo).
 */
async function estimarWatts(items: { texto: string; marcaModelo: string | null; categoriaLabel: string }[]): Promise<Watts[]> {
  if (items.length === 0) return [];
  if (!process.env.ANTHROPIC_API_KEY) return items.map(() => ({ promedio: null, max: null }));

  const listado = items
    .map((it, i) => `${i + 1}. [${it.categoriaLabel}] ${it.texto}${it.marcaModelo ? ` — marca/modelo: ${it.marcaModelo}` : " — sin marca/modelo legible"}`)
    .join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "low" },
      system:
        "Estimás el consumo eléctrico de equipamiento de telecomunicaciones/energía de un sitio técnico, a partir de tu conocimiento " +
        "general de marcas/modelos — nunca a partir de una foto, solo del texto que te paso. Para cada ítem dame DOS números: " +
        '"promedio" (consumo típico en Watts en uso normal) y "max" (consumo pico/máximo en Watts, bajo la carga más alta que pueda ' +
        "darse en operación normal). Importante: el promedio es el consumo REAL típico, NUNCA el vatiaje nominal de la fuente/" +
        "cargador/power supply del equipo si ese número es mayor — una fuente de 65W es lo máximo que PUEDE entregar, no lo que el " +
        "equipo consume la mayoría del tiempo. El máximo sí puede acercarse al vatiaje nominal de la fuente cuando el equipo puede " +
        "llegar a exigirle casi toda su capacidad, pero no lo copies mecánicamente sin pensarlo — siempre \"max\" >= \"promedio\". Es " +
        "una ESTIMACIÓN para planificación energética, no una medición exacta: está bien dar números aproximados si conocés el rango " +
        "típico de ese modelo o de modelos muy similares de la misma familia/fabricante. Devolvé null en los dos campos de un ítem si " +
        "no tiene marca/modelo, o si la marca/modelo no te resulta nada familiar — nunca inventes un número para un equipo que no " +
        "podés justificar de ninguna forma.\n\n" +
        `Respondé ÚNICAMENTE con un JSON válido: un array de ${items.length} objetos {"promedio": number | null, "max": number | ` +
        "null}, en el MISMO ORDEN que la lista (uno por ítem, ninguno de más ni de menos), sin texto antes ni después, sin bloque de " +
        "código markdown.",
      messages: [{ role: "user", content: `Lista de equipamiento:\n${listado}` }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) return items.map(() => ({ promedio: null, max: null }));
    const match = textBlock.text.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : textBlock.text);
    if (!Array.isArray(parsed)) return items.map(() => ({ promedio: null, max: null }));
    return items.map((_, i) => {
      const v = parsed[i];
      const promedio = v && typeof v.promedio === "number" && Number.isFinite(v.promedio) && v.promedio > 0 ? v.promedio : null;
      const maxCrudo = v && typeof v.max === "number" && Number.isFinite(v.max) && v.max > 0 ? v.max : null;
      const max = maxCrudo !== null && promedio !== null ? Math.max(maxCrudo, promedio) : maxCrudo;
      return { promedio, max };
    });
  } catch {
    return items.map(() => ({ promedio: null, max: null }));
  }
}

/**
 * Solo Administrador: `rack_equipamientos`/`equipos` tienen UPDATE
 * restringido a is_admin() por RLS (a propósito, para no dejar que
 * cualquier técnico edite equipamiento que cargó otro) — así que esto
 * fallaría en silencio (0 filas afectadas) para un técnico, no con un
 * error. Se valida el rol explícitamente para dar un mensaje claro en vez
 * de ese silencio.
 */
export async function estimarConsumoRacksAction(rackIds: string[]): Promise<EstimarConsumoResult> {
  const profile = await requireProfile();
  if (profile.rol !== "admin") return { success: false, error: "Solo un Administrador puede completar esto." };
  if (rackIds.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const supabase = await createClient();
  const { data: pendientes, error } = await supabase
    .from("rack_equipamientos")
    .select("id, texto, marca_modelo, categoria_equipo")
    .in("rack_id", rackIds)
    .is("consumo_promedio_w", null);
  if (error) return { success: false, error: error.message };
  if (!pendientes || pendientes.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const watts = await estimarWatts(
    pendientes.map((p) => ({ texto: p.texto, marcaModelo: p.marca_modelo, categoriaLabel: RACK_CATEGORIA_LABEL[p.categoria_equipo] })),
  );

  let estimados = 0;
  let sinDato = 0;
  for (let i = 0; i < pendientes.length; i++) {
    if (watts[i].promedio === null) {
      sinDato++;
      continue;
    }
    const { error: updErr } = await supabase
      .from("rack_equipamientos")
      .update({ consumo_promedio_w: watts[i].promedio, consumo_max_w: watts[i].max })
      .eq("id", pendientes[i].id);
    if (!updErr) estimados++;
  }
  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true, estimados, sinDato };
}

export async function estimarConsumoEquiposAction(ubicacionIds: string[]): Promise<EstimarConsumoResult> {
  const profile = await requireProfile();
  if (profile.rol !== "admin") return { success: false, error: "Solo un Administrador puede completar esto." };
  if (ubicacionIds.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const supabase = await createClient();
  const { data: pendientes, error } = await supabase
    .from("equipos")
    .select("id, texto, marca_modelo, categoria_equipo")
    .in("ubicacion_id", ubicacionIds)
    .is("consumo_promedio_w", null);
  if (error) return { success: false, error: error.message };
  if (!pendientes || pendientes.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const watts = await estimarWatts(
    pendientes.map((p) => ({ texto: p.texto, marcaModelo: p.marca_modelo, categoriaLabel: EQUIPO_CATEGORIA_LABEL[p.categoria_equipo] })),
  );

  let estimados = 0;
  let sinDato = 0;
  for (let i = 0; i < pendientes.length; i++) {
    if (watts[i].promedio === null) {
      sinDato++;
      continue;
    }
    const { error: updErr } = await supabase
      .from("equipos")
      .update({ consumo_promedio_w: watts[i].promedio, consumo_max_w: watts[i].max })
      .eq("id", pendientes[i].id);
    if (!updErr) estimados++;
  }
  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true, estimados, sinDato };
}
