"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/config/audit";
import { puedeGestionarBajas } from "@/lib/types";
import { datosBateriaAColumnas, rolBateria, type DatosBateria } from "@/lib/baterias/types";
import type { TipoFuenteBateria } from "@/lib/database.types";

export interface ActualizarBateriaResult {
  success: boolean;
  error?: string;
}

/**
 * Corrige cuántas baterías lleva un banco/UPS, de qué tipo, su potencia y a
 * qué rectificador/UPS está vinculado — para equipos sueltos y de rack, que
 * por RLS solo puede actualizar un Administrador: igual que Dar de baja, la
 * acción valida el rol antes de tocar nada y usa la service role.
 */
export async function actualizarBateriaAction(payload: {
  tipo: TipoFuenteBateria;
  id: string;
  datos: DatosBateria;
}): Promise<ActualizarBateriaResult> {
  const profile = await requireProfile();
  if (!puedeGestionarBajas(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede corregir los datos de baterías." };
  }
  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch {
    return { success: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  }

  const tabla = payload.tipo === "equipo_individual" ? "equipos" : "rack_equipamientos";
  const { data: actual } = await service.from(tabla).select("id, categoria_equipo, texto").eq("id", payload.id).maybeSingle();
  if (!actual) return { success: false, error: "No se encontró el equipo." };
  if (!rolBateria(actual.categoria_equipo)) return { success: false, error: "Este equipo no lleva datos de baterías." };

  // Un equipo no se vincula consigo mismo.
  const datos =
    payload.datos.alimentadoPorTipo === payload.tipo && payload.datos.alimentadoPorId === payload.id
      ? { ...payload.datos, alimentadoPorTipo: null, alimentadoPorId: null }
      : payload.datos;

  const { error } = await service.from(tabla).update(datosBateriaAColumnas(actual.categoria_equipo, datos)).eq("id", payload.id);
  if (error) return { success: false, error: error.message };

  const supabase = await createClient();
  await logAudit(supabase, profile, `Corrigió los datos de baterías de "${actual.texto}"`);
  revalidatePath("/panel/baterias");
  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true };
}
