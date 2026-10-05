"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { filenameDesdeStoragePath } from "@/lib/pdf/filename";

export interface UrlArchivoResult {
  url: string | null;
  filename?: string;
  error?: string;
}

/** RLS (entregas_deposito_select) ya limita esto a Admin/Supervisor. */
export async function obtenerUrlPdfEntregaAction(entregaId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: entrega, error } = await supabase.from("entregas_deposito").select("pdf_url").eq("id", entregaId).single();
  if (error || !entrega?.pdf_url) {
    return { url: null, error: "El comprobante ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(entrega.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(entrega.pdf_url) };
}
