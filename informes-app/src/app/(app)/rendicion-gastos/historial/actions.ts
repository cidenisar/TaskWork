"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export interface UrlPdfResult {
  url: string | null;
  error?: string;
}

export async function obtenerUrlPdfRendicionAction(rendicionId: string): Promise<UrlPdfResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: rendicion, error } = await supabase
    .from("rendiciones_gastos")
    .select("pdf_url")
    .eq("id", rendicionId)
    .single();

  if (error || !rendicion?.pdf_url) {
    return { url: null, error: "El PDF ya no está disponible — solo queda el registro." };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("informes-pdf")
    .createSignedUrl(rendicion.pdf_url, 60 * 15);

  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl };
}
