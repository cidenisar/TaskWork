"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { filenameDesdeStoragePath } from "@/lib/pdf/filename";
import { eliminarRegistroConArchivos, type EliminarResult } from "@/lib/admin/eliminar-registro";

export interface UrlArchivoResult {
  url: string | null;
  filename?: string;
  error?: string;
}

/** RLS (rack_relevamientos_select_own) ya limita esto a relevamientos propios, o todos si sos Admin/Supervisor. */
export async function obtenerUrlPdfRelevamientoAction(relevamientoId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: relevamiento, error } = await supabase.from("rack_relevamientos").select("pdf_url").eq("id", relevamientoId).single();
  if (error || !relevamiento?.pdf_url) {
    return { url: null, error: "El PDF ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(relevamiento.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(relevamiento.pdf_url) };
}

/** RLS (rack_relevamientos_select_own) ya limita esto a relevamientos propios, o todos si sos Admin/Supervisor. */
export async function obtenerUrlFotoGeneralRackAction(relevamientoId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: relevamiento, error } = await supabase
    .from("rack_relevamientos")
    .select("foto_general_url")
    .eq("id", relevamientoId)
    .single();
  if (error || !relevamiento?.foto_general_url) {
    return { url: null, error: "La foto ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("informe-fotos")
    .createSignedUrl(relevamiento.foto_general_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de la foto." };
  }
  return { url: signed.signedUrl };
}

/** Solo Administrador. Borra el relevamiento, sus lecturas (cascada por FK) y el PDF/foto del storage. */
export async function eliminarRelevamientoRackAction(relevamientoId: string): Promise<EliminarResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: relevamiento } = await service
    .from("rack_relevamientos")
    .select("pdf_url, foto_general_url, numero_generacion")
    .eq("id", relevamientoId)
    .single();

  return eliminarRegistroConArchivos(
    service,
    profile,
    "rack_relevamientos",
    relevamientoId,
    [
      { bucket: "informes-pdf", path: relevamiento?.pdf_url ?? null },
      { bucket: "informe-fotos", path: relevamiento?.foto_general_url ?? null },
    ],
    `Eliminó el relevamiento de rack ${relevamiento?.numero_generacion ?? relevamientoId}`,
  );
}
