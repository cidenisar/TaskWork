"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export interface CrearMantenimientoResult {
  success: boolean;
  error?: string;
}

/**
 * Registro de mantenimiento — no es una grilla por circuito como Medición/
 * Relevamiento, es un log de trabajo realizado (mismo criterio que
 * vehiculo_services): fecha + descripción, con circuito afectado y foto
 * opcionales, y una fecha de próximo mantenimiento opcional. Sin PDF, igual
 * que el Service de Vehículos.
 */
export async function crearMantenimientoAction(formData: FormData): Promise<CrearMantenimientoResult> {
  const profile = await requireProfile();

  const tableroId = String(formData.get("tableroId") || "");
  const circuitoId = String(formData.get("circuitoId") || "") || null;
  const fecha = String(formData.get("fecha") || "");
  const descripcion = String(formData.get("descripcion") || "").trim();
  const proximoMantenimiento = String(formData.get("proximoMantenimiento") || "") || null;
  const foto = formData.get("foto");

  if (!tableroId) return { success: false, error: "Falta el tablero." };
  if (!fecha) return { success: false, error: "Falta la fecha." };
  if (!descripcion) return { success: false, error: "Falta la descripción del trabajo realizado." };

  const supabase = await createClient();

  const { data: mantenimiento, error } = await supabase
    .from("tablero_mantenimientos")
    .insert({
      tablero_id: tableroId,
      circuito_id: circuitoId,
      fecha,
      descripcion,
      proximo_mantenimiento: proximoMantenimiento,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !mantenimiento) {
    return { success: false, error: `No se pudo guardar el mantenimiento: ${error?.message ?? "error desconocido"}` };
  }

  if (foto instanceof File && foto.size > 0) {
    const buffer = Buffer.from(await foto.arrayBuffer());
    const path = `${profile.id}/tableros/mantenimiento/${mantenimiento.id}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("informe-fotos")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (!upErr) {
      await supabase.from("tablero_mantenimientos").update({ foto_url: path }).eq("id", mantenimiento.id);
    }
    // Una foto que falla no debe tirar abajo el registro del mantenimiento.
  }

  return { success: true };
}
