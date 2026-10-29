"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { buscarMateriales, type ResultadoBusquedaMateriales } from "@/lib/materiales/buscar";

export async function buscarMaterialesAction(query: string): Promise<ResultadoBusquedaMateriales> {
  await requireProfile();
  const supabase = await createClient();
  return buscarMateriales(supabase, query);
}
