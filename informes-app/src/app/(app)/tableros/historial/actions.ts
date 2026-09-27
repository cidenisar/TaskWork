"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { filenameDesdeStoragePath } from "@/lib/pdf/filename";

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
