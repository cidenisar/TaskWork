"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export interface AccionResult {
  success: boolean;
  error?: string;
}

export interface SuscripcionPushInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Guarda (o renueva) la suscripción Web Push de este navegador —
 * infraestructura general, no específica de Guardia General (CRITERIOS_Y_IDEAS.md
 * §6): cualquier módulo futuro que necesite avisar algo reusa esta misma
 * tabla. `endpoint` es único por navegador/dispositivo; si ya existía
 * (reinstaló la app, limpió datos) se actualizan las claves en vez de
 * fallar por la unicidad.
 */
export async function guardarSuscripcionPushAction(sub: SuscripcionPushInput, userAgent: string): Promise<AccionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      usuario_id: profile.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function eliminarSuscripcionPushAction(endpoint: string): Promise<AccionResult> {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
