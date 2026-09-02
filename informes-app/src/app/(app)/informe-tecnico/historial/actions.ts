"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export interface UrlPdfResult {
  url: string | null;
  error?: string;
}

/**
 * Devuelve una URL firmada temporal para el PDF de un informe propio.
 * El bucket es privado — RLS ya garantiza que solo se puede pedir esto
 * de un informe creado por el usuario logueado.
 */
export async function obtenerUrlPdfInformeAction(informeId: string): Promise<UrlPdfResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: informe, error } = await supabase
    .from("informes_tecnicos")
    .select("pdf_url")
    .eq("id", informeId)
    .single();

  if (error || !informe?.pdf_url) {
    return { url: null, error: "El PDF ya no está disponible — solo queda el registro." };
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("informes-pdf")
    .createSignedUrl(informe.pdf_url, 60 * 15);

  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl };
}
