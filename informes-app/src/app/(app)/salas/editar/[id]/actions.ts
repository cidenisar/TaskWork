"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { renderSalaPdf } from "@/lib/pdf/render";
import { buildSalaFilename } from "@/lib/pdf/filename";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadGps } from "@/lib/ubicaciones/resolver";
import type { SalaTipoConstruccion } from "@/lib/database.types";

interface Payload {
  ubicacionId: string; // "" = no se tocó la ubicación en esta edición, "__new" = crear una
  provinciaFiltro: string;
  localidadNueva: string;
  sitioNueva: string;
  plantaNueva: string;
  oficinaNueva: string;
  gps: PayloadGps | null;
  denominacion: string;
  tipoConstruccion: SalaTipoConstruccion | "";
  fecha: string;
}

export interface ActualizarSalaResult {
  success: boolean;
  error?: string;
  pdfUrl?: string | null;
}

/**
 * Edita una sala ya relevada — solo Administrador, puede editar cualquiera
 * (no solo la propia), mismo criterio que eliminarSalaAction: `requireAdmin()`
 * + service role key, bypasseando "salas_update_own". Las fotos generales
 * quedan como están (igual que la edición de Informe Técnico) — se
 * recuperan de storage para regenerar el PDF con los datos de texto ya
 * corregidos, no hay UI acá para agregar/sacar fotos.
 */
export async function actualizarSalaAction(salaId: string, formData: FormData): Promise<ActualizarSalaResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Datos inválidos." };
  }
  if (!payload.denominacion.trim()) return { success: false, error: "Falta la denominación de la sala." };
  if (!payload.tipoConstruccion) return { success: false, error: "Falta el tipo de construcción." };
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  const { data: salaActual, error: fetchErr } = await service
    .from("salas")
    .select("ubicacion_id, numero_generacion, fotos_generales_urls")
    .eq("id", salaId)
    .single();
  if (fetchErr || !salaActual) return { success: false, error: "No se encontró la sala." };
  const numeroGeneracion = salaActual.numero_generacion;

  // Misma lógica que crearSalaAction: la ubicación solo se toca si en esta
  // edición se eligió/creó una distinta.
  let ubicacionIdFinal = salaActual.ubicacion_id;
  if (payload.ubicacionId && payload.ubicacionId !== salaActual.ubicacion_id) {
    const resuelta = await resolverUbicacionId(
      service,
      {
        ubicacionId: payload.ubicacionId !== "__new" ? payload.ubicacionId : null,
        ubicacionNueva:
          payload.ubicacionId === "__new"
            ? {
                provincia: payload.provinciaFiltro,
                localidad: payload.localidadNueva,
                sitio: payload.sitioNueva,
                planta: payload.plantaNueva,
                oficina: payload.oficinaNueva,
              }
            : null,
      },
      profile.id,
      "la sala",
    );
    if ("error" in resuelta) return { success: false, error: resuelta.error };
    ubicacionIdFinal = resuelta.id;
  }

  const { data: ubicacionRow, error: ubicacionReadErr } = await service
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", ubicacionIdFinal)
    .single();
  if (ubicacionReadErr || !ubicacionRow) return { success: false, error: "No se encontró la ubicación." };
  await tagGpsSiFalta(service, ubicacionIdFinal, payload.gps, profile.id);

  const { error: updErr } = await service
    .from("salas")
    .update({
      ubicacion_id: ubicacionIdFinal,
      denominacion: payload.denominacion.trim(),
      tipo_construccion: payload.tipoConstruccion,
    })
    .eq("id", salaId);
  if (updErr) return { success: false, error: `No se pudo actualizar la sala: ${updErr.message}` };

  const fotosGeneralesBuffers: Buffer[] = [];
  for (const path of salaActual.fotos_generales_urls ?? []) {
    const { data: blob } = await service.storage.from("informe-fotos").download(path);
    if (blob) fotosGeneralesBuffers.push(Buffer.from(await blob.arrayBuffer()));
  }

  const { data: config } = await service.from("config_general").select("logo_empresa_url").eq("id", 1).single();
  let logoBuffer: Buffer | null = null;
  if (config?.logo_empresa_url) {
    try {
      const res = await fetch(config.logo_empresa_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // seguimos sin logo antes que fallar la regeneración del PDF
    }
  }

  const pdfBuffer = await renderSalaPdf({
    numeroGeneracion,
    region: ubicacionRow.region,
    provincia: ubicacionRow.provincia,
    localidad: ubicacionRow.localidad,
    sitio: ubicacionRow.sitio,
    planta: ubicacionRow.planta,
    oficina: ubicacionRow.oficina,
    denominacion: payload.denominacion.trim(),
    tipoConstruccion: payload.tipoConstruccion,
    fecha: payload.fecha,
    fotosGeneralesBuffers: fotosGeneralesBuffers.length > 0 ? fotosGeneralesBuffers : null,
    logoBuffer,
    appName: "TaskWork",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildSalaFilename({ numeroGeneracion, denominacion: payload.denominacion.trim(), sitio: ubicacionRow.sitio });
  const pdfPath = `${profile.id}/salas/${salaId}/${pdfFilename}`;
  const { error: pdfUpErr } = await service.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await service.from("salas").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", salaId);
    const { data: signed } = await service.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  const supabase = await createClient();
  await logAudit(supabase, profile, `Editó la sala ${numeroGeneracion}`);
  return { success: true, pdfUrl };
}
