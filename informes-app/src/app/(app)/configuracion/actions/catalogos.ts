"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ConfigActionResult } from "./empresa";

const REVALIDATE_PATHS = ["/configuracion", "/informe-tecnico/nuevo", "/rendicion-gastos/nueva"] as const;

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

type SimpleCatalogTable =
  | "catalogo_torres"
  | "catalogo_provincias"
  | "catalogo_tipos_informe"
  | "catalogo_categorias_gasto";

const ETIQUETAS: Record<SimpleCatalogTable, string> = {
  catalogo_torres: "Torres",
  catalogo_provincias: "Provincias",
  catalogo_tipos_informe: "Tipos de Informe",
  catalogo_categorias_gasto: "Categorías de Gasto",
};

export async function addSimpleCatalogItemAction(
  tabla: SimpleCatalogTable,
  nombre: string,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const value = nombre.trim();
  if (!value) return { success: false, error: "El nombre no puede estar vacío." };

  const supabase = await createClient();
  const { error } = await supabase.from(tabla).insert({ nombre: value });
  if (error) {
    return { success: false, error: error.code === "23505" ? "Ya existe un ítem con ese nombre." : error.message };
  }
  await logAudit(supabase, profile, `Agregó "${value}" a ${ETIQUETAS[tabla]}`);
  revalidateAll();
  return { success: true };
}

export async function removeSimpleCatalogItemAction(
  tabla: SimpleCatalogTable,
  id: string,
  nombre: string,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from(tabla).delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  await logAudit(supabase, profile, `Quitó "${nombre}" de ${ETIQUETAS[tabla]}`);
  revalidateAll();
  return { success: true };
}

export async function addTecnicoAction(nombre: string, torre: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const value = nombre.trim();
  if (!value) return { success: false, error: "El nombre no puede estar vacío." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogo_tecnicos")
    .insert({ nombre_completo: value, torre: torre.trim() || null, created_by: profile.id });
  if (error) {
    return { success: false, error: error.code === "23505" ? "Ya existe un técnico con ese nombre." : error.message };
  }
  await logAudit(supabase, profile, `Agregó "${value}" al catálogo de Técnicos`);
  revalidateAll();
  return { success: true };
}

export async function removeTecnicoAction(id: string, nombre: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_tecnicos").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  await logAudit(supabase, profile, `Quitó "${nombre}" del catálogo de Técnicos`);
  revalidateAll();
  return { success: true };
}
