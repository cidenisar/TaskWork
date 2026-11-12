"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { TIPO_MONTAJE_LABEL } from "@/lib/equipos/recurso-altura";
import type { ConfigActionResult } from "./empresa";
import type { TipoMontajeCamara } from "@/lib/database.types";

function revalidateAll() {
  revalidatePath("/configuracion/catalogos");
  revalidatePath("/equipos/nuevo");
  revalidatePath("/panel/mantenimientos");
  revalidatePath("/ubicaciones/[id]", "page");
}

/**
 * "recursoFijo" (ej. torre -> grupo de altura) ignora la altura. Vaciarlo
 * (cadena vacía) vuelve a "según altura" — se decide por las bandas de
 * catalogo_recurso_altura_bandas. Upsert por tipo_montaje (fila fija, 6
 * tipos — igual criterio que mantenimiento_intervalos).
 */
export async function guardarRecursoFijoAction(tipoMontaje: TipoMontajeCamara, recursoFijo: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_recurso_altura").upsert(
    {
      tipo_montaje: tipoMontaje,
      recurso_fijo: recursoFijo.trim() || null,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tipo_montaje" },
  );
  if (error) return { success: false, error: error.message };

  const detalle = recursoFijo.trim() ? `siempre ${recursoFijo.trim()}` : "según altura (bandas configuradas)";
  await logAudit(supabase, profile, `Configuró el recurso de altura para montaje en ${TIPO_MONTAJE_LABEL[tipoMontaje]}: ${detalle}`);
  revalidateAll();
  return { success: true };
}

/**
 * Banda "hasta tantos metros, tal recurso" para un tipo de montaje — igual
 * criterio que catalogo_calibre_cable: una lista ascendente, se busca la
 * banda más chica que alcance a cubrir la altura real.
 */
export async function agregarBandaRecursoAlturaAction(
  tipoMontaje: TipoMontajeCamara,
  alturaHastaM: string,
  recurso: string,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const altura = Number(alturaHastaM);
  if (!Number.isFinite(altura) || altura <= 0) return { success: false, error: "La altura tiene que ser un número mayor a 0." };
  if (!recurso.trim()) return { success: false, error: "Elegí el recurso para esta banda." };

  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_recurso_altura_bandas").insert({
    tipo_montaje: tipoMontaje,
    altura_hasta_m: altura,
    recurso: recurso.trim(),
    created_by: profile.id,
  });
  if (error) {
    return { success: false, error: error.code === "23505" ? "Ya hay una banda con esa altura para este tipo de montaje." : error.message };
  }

  await logAudit(supabase, profile, `Agregó banda de recurso de altura en ${TIPO_MONTAJE_LABEL[tipoMontaje]}: hasta ${altura}m → ${recurso.trim()}`);
  revalidateAll();
  return { success: true };
}

export async function quitarBandaRecursoAlturaAction(id: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_recurso_altura_bandas").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, "Eliminó una banda de recurso de altura");
  revalidateAll();
  return { success: true };
}
