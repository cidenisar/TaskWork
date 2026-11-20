"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/config/audit";
import { createClient } from "@/lib/supabase/server";

export interface ActualizarMantenimientoResult {
  success: boolean;
  error?: string;
}

/**
 * Edita un mantenimiento ya registrado — solo Administrador (ver
 * eliminarMantenimientoAction en ../../../historial/actions.ts, mismo
 * criterio: requireAdmin + service role, así el admin puede corregir
 * cualquier mantenimiento, no solo el que creó el propio usuario). Si se
 * elige una foto nueva reemplaza la anterior (mismo path, upsert); si no,
 * la que ya estaba queda como estaba.
 */
export async function actualizarMantenimientoAction(mantenimientoId: string, formData: FormData): Promise<ActualizarMantenimientoResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const tableroId = String(formData.get("tableroId") || "");
  const circuitoId = String(formData.get("circuitoId") || "") || null;
  const fecha = String(formData.get("fecha") || "");
  const descripcion = String(formData.get("descripcion") || "").trim();
  const proximoMantenimiento = String(formData.get("proximoMantenimiento") || "") || null;
  const foto = formData.get("foto");

  if (!tableroId) return { success: false, error: "Falta el tablero." };
  if (!fecha) return { success: false, error: "Falta la fecha." };
  if (!descripcion) return { success: false, error: "Falta la descripción del trabajo realizado." };

  const { error } = await service
    .from("tablero_mantenimientos")
    .update({ tablero_id: tableroId, circuito_id: circuitoId, fecha, descripcion, proximo_mantenimiento: proximoMantenimiento })
    .eq("id", mantenimientoId);
  if (error) return { success: false, error: `No se pudo actualizar el mantenimiento: ${error.message}` };

  if (foto instanceof File && foto.size > 0) {
    const buffer = Buffer.from(await foto.arrayBuffer());
    const path = `${profile.id}/tableros/mantenimiento/${mantenimientoId}.jpg`;
    const { error: upErr } = await service.storage.from("informe-fotos").upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (!upErr) {
      await service.from("tablero_mantenimientos").update({ foto_url: path }).eq("id", mantenimientoId);
    }
  }

  const supabase = await createClient();
  await logAudit(supabase, profile, `Editó el mantenimiento de tablero del ${fecha} (${mantenimientoId})`);

  revalidatePath("/tableros/historial");
  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true };
}
