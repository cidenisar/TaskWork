"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/config/audit";
import { puedeGestionarBajas } from "@/lib/types";
import { parsearLatitud, parsearLongitud } from "@/lib/ubicaciones/coordenadas";

export interface CorregirCoordenadasResult {
  success: boolean;
  error?: string;
  actualizadas?: number;
}

/**
 * Corrige (o quita) las coordenadas de uno o varios lugares (filas de
 * `ubicaciones`) — la ubicación que usa el mapa para ubicar todo lo relevado
 * ahí. El UPDATE de `ubicaciones` es admin-only por RLS, así que la acción
 * valida el rol (Administrador, Supervisor o Superusuario) antes de tocar nada
 * y escribe con service role; queda constancia en auditoría con el valor
 * anterior, porque mover un sitio en el mapa no se puede deshacer solo.
 * `lat`/`lng` en null quita las coordenadas (el lugar deja de aparecer en el mapa).
 */
export async function corregirCoordenadasAction(payload: {
  ubicacionIds: string[];
  lat: number | null;
  lng: number | null;
}): Promise<CorregirCoordenadasResult> {
  const profile = await requireProfile();
  if (!puedeGestionarBajas(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede corregir las coordenadas." };
  }
  const ids = [...new Set(payload.ubicacionIds)].filter(Boolean);
  if (ids.length === 0) return { success: false, error: "No hay ningún lugar elegido." };
  if (ids.length > 200) return { success: false, error: "Son demasiados lugares juntos." };

  const quitar = payload.lat === null && payload.lng === null;
  if (!quitar) {
    if (payload.lat === null || payload.lng === null || parsearLatitud(String(payload.lat)) === null || parsearLongitud(String(payload.lng)) === null) {
      return { success: false, error: "Latitud (entre -90 y 90) y longitud (entre -180 y 180) tienen que ser números." };
    }
  }

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch {
    return { success: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  }

  const { data: antes } = await service.from("ubicaciones").select("id, sitio, planta, oficina, lat, lng").in("id", ids);
  if (!antes || antes.length === 0) return { success: false, error: "No se encontró el lugar." };

  const { error } = await service
    .from("ubicaciones")
    .update(
      quitar
        ? { lat: null, lng: null, gps_accuracy_m: null, gps_confirmado_at: null, gps_confirmado_por: null }
        : { lat: payload.lat, lng: payload.lng, gps_accuracy_m: null, gps_confirmado_at: new Date().toISOString(), gps_confirmado_por: profile.id },
    )
    .in(
      "id",
      antes.map((a) => a.id),
    );
  if (error) return { success: false, error: error.message };

  const resumenAntes = antes
    .slice(0, 5)
    .map((a) => `${[a.oficina, a.planta, a.sitio].filter(Boolean)[0] ?? a.sitio} (antes ${a.lat !== null ? `${a.lat}, ${a.lng}` : "sin coordenadas"})`)
    .join("; ");
  const supabase = await createClient();
  await logAudit(
    supabase,
    profile,
    quitar
      ? `Quitó las coordenadas de ${antes.length} lugar(es): ${resumenAntes}`
      : `Corrigió las coordenadas de ${antes.length} lugar(es) a ${payload.lat}, ${payload.lng}: ${resumenAntes}${antes.length > 5 ? "…" : ""}`,
  );

  revalidatePath("/panel", "layout");
  revalidatePath("/ubicaciones", "layout");
  return { success: true, actualizadas: antes.length };
}
