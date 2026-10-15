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

/** RLS (torre_comunicacion_relevamientos_select_own) ya limita esto a relevamientos propios, o todos si sos Admin/Supervisor. */
export async function obtenerUrlPdfRelevamientoAction(relevamientoId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: relevamiento, error } = await supabase
    .from("torre_comunicacion_relevamientos")
    .select("pdf_url")
    .eq("id", relevamientoId)
    .single();
  if (error || !relevamiento?.pdf_url) {
    return { url: null, error: "El PDF ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(relevamiento.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(relevamiento.pdf_url) };
}

export interface UrlsFotosResult {
  urls: string[];
  error?: string;
}

/** RLS (torre_comunicacion_relevamientos_select_own) ya limita esto a relevamientos propios, o todos si sos Admin/Supervisor. */
export async function obtenerUrlsFotosGeneralesTorreAction(relevamientoId: string): Promise<UrlsFotosResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: relevamiento, error } = await supabase
    .from("torre_comunicacion_relevamientos")
    .select("fotos_generales_urls")
    .eq("id", relevamientoId)
    .single();
  if (error || !relevamiento?.fotos_generales_urls || relevamiento.fotos_generales_urls.length === 0) {
    return { urls: [], error: "Las fotos ya no están disponibles." };
  }

  const urls: string[] = [];
  for (const path of relevamiento.fotos_generales_urls) {
    const { data: signed } = await supabase.storage.from("informe-fotos").createSignedUrl(path, 60 * 15);
    if (signed) urls.push(signed.signedUrl);
  }
  if (urls.length === 0) {
    return { urls: [], error: "No se pudo generar el link de las fotos." };
  }
  return { urls };
}

/** Solo Administrador. Borra el relevamiento, sus lecturas (cascada por FK) y el PDF/fotos del storage. */
export async function eliminarRelevamientoTorreComunicacionAction(relevamientoId: string): Promise<EliminarResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: relevamiento } = await service
    .from("torre_comunicacion_relevamientos")
    .select("pdf_url, fotos_generales_urls, numero_generacion")
    .eq("id", relevamientoId)
    .single();

  return eliminarRegistroConArchivos(
    service,
    profile,
    "torre_comunicacion_relevamientos",
    relevamientoId,
    [
      { bucket: "informes-pdf", path: relevamiento?.pdf_url ?? null },
      ...(relevamiento?.fotos_generales_urls ?? []).map((path) => ({ bucket: "informe-fotos", path })),
    ],
    `Eliminó el relevamiento de torre de comunicaciones ${relevamiento?.numero_generacion ?? relevamientoId}`,
  );
}
