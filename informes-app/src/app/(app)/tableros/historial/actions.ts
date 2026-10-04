"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { filenameDesdeStoragePath } from "@/lib/pdf/filename";
import { eliminarRegistroConArchivos, type EliminarResult } from "@/lib/admin/eliminar-registro";

export interface UrlPdfResult {
  url: string | null;
  filename?: string;
  error?: string;
}

/** RLS (tablero_mediciones_select_own) ya limita esto a mediciones propias, o todas si sos Admin/Supervisor. */
export async function obtenerUrlPdfMedicionAction(medicionId: string): Promise<UrlPdfResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: medicion, error } = await supabase.from("tablero_mediciones").select("pdf_url").eq("id", medicionId).single();
  if (error || !medicion?.pdf_url) {
    return { url: null, error: "El PDF ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(medicion.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(medicion.pdf_url) };
}

/** RLS (tablero_mantenimientos_select_own) ya limita esto a mantenimientos propios, o todos si sos Admin/Supervisor. */
export async function obtenerUrlFotoMantenimientoAction(mantenimientoId: string): Promise<UrlPdfResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: mantenimiento, error } = await supabase
    .from("tablero_mantenimientos")
    .select("foto_url")
    .eq("id", mantenimientoId)
    .single();
  if (error || !mantenimiento?.foto_url) {
    return { url: null, error: "La foto ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informe-fotos").createSignedUrl(mantenimiento.foto_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de la foto." };
  }
  return { url: signed.signedUrl };
}

/** Solo Administrador. Borra la medición, sus lecturas (cascada por FK) y el PDF/foto del storage. */
export async function eliminarMedicionAction(medicionId: string): Promise<EliminarResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: medicion } = await service
    .from("tablero_mediciones")
    .select("pdf_url, foto_general_url, numero_generacion")
    .eq("id", medicionId)
    .single();

  return eliminarRegistroConArchivos(
    service,
    profile,
    "tablero_mediciones",
    medicionId,
    [
      { bucket: "informes-pdf", path: medicion?.pdf_url ?? null },
      { bucket: "informe-fotos", path: medicion?.foto_general_url ?? null },
    ],
    `Eliminó la medición de tablero ${medicion?.numero_generacion ?? medicionId}`,
  );
}

/** Solo Administrador. Borra el mantenimiento y su foto del storage. */
export async function eliminarMantenimientoAction(mantenimientoId: string): Promise<EliminarResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: mantenimiento } = await service.from("tablero_mantenimientos").select("foto_url, fecha").eq("id", mantenimientoId).single();

  return eliminarRegistroConArchivos(
    service,
    profile,
    "tablero_mantenimientos",
    mantenimientoId,
    [{ bucket: "informe-fotos", path: mantenimiento?.foto_url ?? null }],
    `Eliminó el mantenimiento de tablero del ${mantenimiento?.fecha ?? mantenimientoId}`,
  );
}
