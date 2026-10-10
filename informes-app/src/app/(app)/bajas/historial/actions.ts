"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
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
