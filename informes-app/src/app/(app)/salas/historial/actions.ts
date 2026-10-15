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

/** salas_select es abierta a cualquier autenticado — no hace falta filtrar por creador. */
export async function obtenerUrlPdfSalaAction(salaId: string): Promise<UrlPdfResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: sala, error } = await supabase.from("salas").select("pdf_url").eq("id", salaId).single();
  if (error || !sala?.pdf_url) {
    return { url: null, error: "El PDF ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(sala.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(sala.pdf_url) };
}

/** Solo Administrador. Borra la sala y sus fotos/PDF del storage. */
export async function eliminarSalaAction(salaId: string): Promise<EliminarResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: sala } = await service
    .from("salas")
    .select("pdf_url, fotos_generales_urls, numero_generacion")
    .eq("id", salaId)
    .single();

  return eliminarRegistroConArchivos(
    service,
    profile,
    "salas",
    salaId,
    [
      { bucket: "informes-pdf", path: sala?.pdf_url ?? null },
      ...(sala?.fotos_generales_urls ?? []).map((path) => ({ bucket: "informe-fotos", path })),
    ],
    `Eliminó la sala ${sala?.numero_generacion ?? salaId}`,
  );
}
