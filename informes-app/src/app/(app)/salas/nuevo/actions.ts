"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionSala } from "@/lib/salas/numero-generacion";
import { renderSalaPdf } from "@/lib/pdf/render";
import { buildSalaFilename } from "@/lib/pdf/filename";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import type { SalaTipoConstruccion } from "@/lib/database.types";

export interface CrearSalaPayload {
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  denominacion: string;
  tipoConstruccion: SalaTipoConstruccion;
  fecha: string;
}

export interface CrearSalaResult {
  success: boolean;
  error?: string;
  salaId?: string;
  numeroGeneracion?: string;
  pdfUrl?: string | null;
}

export async function crearSalaAction(formData: FormData): Promise<CrearSalaResult> {
  const profile = await requireProfile();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Faltan datos de la sala." };
  let payload: CrearSalaPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Faltan datos de la sala." };
  }
  if (!payload.denominacion.trim()) return { success: false, error: "Falta la denominación de la sala." };
  if (!payload.tipoConstruccion) return { success: false, error: "Falta el tipo de construcción." };
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  const supabase = await createClient();

  const ubicacion = await resolverUbicacionId(supabase, payload, profile.id, "la sala");
  if ("error" in ubicacion) return { success: false, error: ubicacion.error };
  const ubicacionId = ubicacion.id;

  const { data: ubicacionRow, error: ubicacionReadErr } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", ubicacionId)
    .single();
  if (ubicacionReadErr || !ubicacionRow) return { success: false, error: "No se encontró la ubicación." };
  await tagGpsSiFalta(supabase, ubicacionId, payload.gps, profile.id);

  let numeroGeneracion = nuevoNumeroGeneracionSala();
  let salaId: string | null = null;
  for (let attempt = 0; attempt < 5 && !salaId; attempt++) {
    const { data, error } = await supabase
      .from("salas")
      .insert({
        ubicacion_id: ubicacionId,
        denominacion: payload.denominacion.trim(),
        tipo_construccion: payload.tipoConstruccion,
        numero_generacion: numeroGeneracion,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionSala();
        continue;
      }
      return { success: false, error: `No se pudo guardar la sala: ${error.message}` };
    }
    salaId = data!.id;
  }
  if (!salaId) return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };

  // Fotos generales (opcional): mismo patrón que Tableros — se suben antes
  // de generar el PDF para poder adjuntarlas ahí.
  const fotosFiles = formData.getAll("fotoGeneral").filter((f): f is File => f instanceof File);
  const fotosGeneralesBuffers: Buffer[] = [];
  const fotosGeneralesUrls: string[] = [];
  for (let i = 0; i < fotosFiles.length; i++) {
    const buffer = Buffer.from(await fotosFiles[i].arrayBuffer());
    fotosGeneralesBuffers.push(buffer);
    const fotoPath = `${profile.id}/salas/${salaId}/general-${i + 1}.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(fotoPath, buffer, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) fotosGeneralesUrls.push(fotoPath);
  }
  if (fotosGeneralesUrls.length > 0) {
    await supabase.from("salas").update({ fotos_generales_urls: fotosGeneralesUrls }).eq("id", salaId);
  }

  const { data: config } = await supabase.from("config_general").select("logo_empresa_url").eq("id", 1).single();
  let logoBuffer: Buffer | null = null;
  if (config?.logo_empresa_url) {
    try {
      const res = await fetch(config.logo_empresa_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // seguimos sin logo antes que fallar la generación del PDF
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
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildSalaFilename({ numeroGeneracion, denominacion: payload.denominacion.trim(), sitio: ubicacionRow.sitio });
  const pdfPath = `${profile.id}/salas/${salaId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await supabase.from("salas").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", salaId);
    const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return { success: true, salaId, numeroGeneracion, pdfUrl };
}
