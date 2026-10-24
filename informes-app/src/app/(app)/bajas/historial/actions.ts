"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { puedeGestionarBajas } from "@/lib/types";
import { filenameDesdeStoragePath } from "@/lib/pdf/filename";

export interface UrlArchivoResult {
  url: string | null;
  filename?: string;
  error?: string;
}

/** RLS (bajas_equipamiento_select) ya limita esto a Admin/Supervisor. */
export async function obtenerUrlPdfBajaAction(bajaId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: baja, error } = await supabase.from("bajas_equipamiento").select("pdf_url").eq("id", bajaId).single();
  if (error || !baja?.pdf_url) {
    return { url: null, error: "El comprobante ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(baja.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(baja.pdf_url) };
}

export interface ConfirmarEntregaDepositoResult {
  success: boolean;
  error?: string;
}

/**
 * Confirma que un equipo ya dado de baja llegó físicamente al depósito —
 * evento separado de la baja en sí (que puede haber pasado días/semanas
 * antes, mientras el equipo esperaba en el sitio el próximo viaje). No
 * crea una fila nueva ni cambia `estado` (ya quedó en 'baja' desde el
 * alta): solo dos columnas de confirmación en el mismo registro, que ya
 * trae el sitio de origen.
 */
export async function confirmarEntregaDepositoAction(bajaId: string): Promise<ConfirmarEntregaDepositoResult> {
  const profile = await requireProfile();
  if (!puedeGestionarBajas(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede confirmar la entrega a depósito." };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("bajas_equipamiento")
    .update({ entregado_deposito_at: new Date().toISOString(), entregado_deposito_por: profile.id })
    .eq("id", bajaId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/bajas/historial");
  return { success: true };
}
