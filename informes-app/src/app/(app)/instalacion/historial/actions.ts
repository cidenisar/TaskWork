"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { filenameDesdeStoragePath } from "@/lib/pdf/filename";

export interface UrlArchivoResult {
  url: string | null;
  filename?: string;
  error?: string;
}

/** RLS (instalaciones_select) es abierta a cualquier autenticado. */
export async function obtenerUrlPdfInstalacionAction(instalacionId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: instalacion, error } = await supabase.from("instalaciones").select("pdf_url").eq("id", instalacionId).single();
  if (error || !instalacion?.pdf_url) {
    return { url: null, error: "El comprobante ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(instalacion.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(instalacion.pdf_url) };
}

export async function obtenerUrlFotoRemitoAction(instalacionId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: instalacion, error } = await supabase.from("instalaciones").select("remito_foto_url").eq("id", instalacionId).single();
  if (error || !instalacion?.remito_foto_url) {
    return { url: null, error: "La foto del remito ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informe-fotos").createSignedUrl(instalacion.remito_foto_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de la foto." };
  }
  return { url: signed.signedUrl };
}
