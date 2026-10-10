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
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(rendicion.pdf_url) };
}

/** Solo Administrador. Borra la rendición, sus gastos/técnicos (cascada por FK) y el PDF/comprobantes del storage. */
export async function eliminarRendicionAction(rendicionId: string): Promise<EliminarResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const [{ data: rendicion }, { data: gastos }] = await Promise.all([
    service.from("rendiciones_gastos").select("pdf_url, numero_generacion, motivo").eq("id", rendicionId).single(),
    service.from("gastos").select("comprobante_url").eq("rendicion_id", rendicionId),
  ]);

  return eliminarRegistroConArchivos(
    service,
    profile,
    "rendiciones_gastos",
    rendicionId,
    [
      { bucket: "informes-pdf", path: rendicion?.pdf_url ?? null },
      ...(gastos ?? []).map((g) => ({ bucket: "comprobantes", path: g.comprobante_url })),
    ],
    `Eliminó la rendición de gastos ${rendicion?.numero_generacion ?? rendicionId}${rendicion?.motivo ? ` (${rendicion.motivo})` : ""}`,
  );
}
