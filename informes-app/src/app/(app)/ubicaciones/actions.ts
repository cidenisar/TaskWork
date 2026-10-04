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

/**
 * Backfill de "Consumo estimado (IA)" para equipamiento que ya estaba
 * cargado antes de que existiera este campo (o para el que la IA no pudo
 * estimar en el momento del relevamiento). Un solo pedido a Claude con
 * TODOS los ítems pendientes de un sitio — más barato y rápido que uno por
 * ítem — pide un número de Watts o null por cada uno, en el mismo orden.
 * Solo texto (categoría + marca/modelo ya identificados), sin fotos: la
 * estimación es por conocimiento general de ese modelo, no por lo que se
 * ve en una imagen.
 */
async function estimarWatts(
  items: { texto: string; marcaModelo: string | null; categoriaLabel: string }[],
): Promise<(number | null)[]> {
  if (items.length === 0) return [];
  if (!process.env.ANTHROPIC_API_KEY) return items.map(() => null);

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
        "Estimás el consumo eléctrico típico (en Watts, en operación normal) de equipamiento de telecomunicaciones/energía de un " +
        "sitio técnico, a partir de tu conocimiento general de marcas/modelos — nunca a partir de una foto, solo del texto que te " +
        "paso. Es una ESTIMACIÓN para planificación energética, no una medición exacta: está bien dar un número aproximado si " +
        "conocés el rango típico de ese modelo o de modelos muy similares de la misma familia/fabricante. Devolvé null para un " +
        "ítem si no tiene marca/modelo, o si la marca/modelo no te resulta nada familiar — nunca inventes un número para un equipo " +
        "que no podés justificar de ninguna forma.\n\n" +
        `Respondé ÚNICAMENTE con un JSON válido: un array de ${items.length} números o null, en el MISMO ORDEN que la lista (uno ` +
        "por ítem, ninguno de más ni de menos), sin texto antes ni después, sin bloque de código markdown.",
      messages: [{ role: "user", content: `Lista de equipamiento:\n${listado}` }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) return items.map(() => null);
    const match = textBlock.text.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : textBlock.text);
    if (!Array.isArray(parsed)) return items.map(() => null);
    return items.map((_, i) => {
      const v = parsed[i];
      return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
    });
  } catch {
    return items.map(() => null);
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
    .is("consumo_estimado_w", null);
  if (error) return { success: false, error: error.message };
  if (!pendientes || pendientes.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const watts = await estimarWatts(
    pendientes.map((p) => ({ texto: p.texto, marcaModelo: p.marca_modelo, categoriaLabel: RACK_CATEGORIA_LABEL[p.categoria_equipo] })),
  );

  let estimados = 0;
  let sinDato = 0;
  for (let i = 0; i < pendientes.length; i++) {
    if (watts[i] === null) {
      sinDato++;
      continue;
    }
    const { error: updErr } = await supabase.from("rack_equipamientos").update({ consumo_estimado_w: watts[i] }).eq("id", pendientes[i].id);
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
    .is("consumo_estimado_w", null);
  if (error) return { success: false, error: error.message };
  if (!pendientes || pendientes.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const watts = await estimarWatts(
    pendientes.map((p) => ({ texto: p.texto, marcaModelo: p.marca_modelo, categoriaLabel: EQUIPO_CATEGORIA_LABEL[p.categoria_equipo] })),
  );

  let estimados = 0;
  let sinDato = 0;
  for (let i = 0; i < pendientes.length; i++) {
    if (watts[i] === null) {
      sinDato++;
      continue;
    }
    const { error: updErr } = await supabase.from("equipos").update({ consumo_estimado_w: watts[i] }).eq("id", pendientes[i].id);
    if (!updErr) estimados++;
  }
  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true, estimados, sinDato };
}
