"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionEquipo } from "@/lib/equipos/numero-generacion";
import { renderEquipoPdf } from "@/lib/pdf/render";
import { buildEquipoFilename } from "@/lib/pdf/filename";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { calcularResumenEquipos } from "@/components/equipos/types";
import type { EquipoCategoria } from "@/lib/database.types";

interface PayloadLectura {
  equipoId: string | null;
  categoriaEquipo: EquipoCategoria;
  texto: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  estado: string;
  comentario: string;
}

export interface CrearRelevamientoEquiposPayload {
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  fecha: string;
  lecturas: PayloadLectura[];
}

export interface CrearRelevamientoEquiposResult {
  success: boolean;
  error?: string;
  relevamientoId?: string;
  numeroGeneracion?: string;
  pdfUrl?: string | null;
}

export async function crearRelevamientoEquiposAction(formData: FormData): Promise<CrearRelevamientoEquiposResult> {
  const profile = await requireProfile();

  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { success: false, error: "Faltan datos del relevamiento." };
  }
  let payload: CrearRelevamientoEquiposPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Faltan datos del relevamiento." };
  }
  const fotoGeneral = formData.get("fotoGeneral");

  if (!payload.lecturas.length) {
    return { success: false, error: "No hay equipos cargados." };
  }
  if (!payload.fecha) {
    return { success: false, error: "Falta la fecha." };
  }

  const supabase = await createClient();

  const ubicacion = await resolverUbicacionId(supabase, payload, profile.id, "el equipo");
  if ("error" in ubicacion) return { success: false, error: ubicacion.error };
  const ubicacionId = ubicacion.id;

  const { data: ubicacionRow, error: ubicacionReadErr } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", ubicacionId)
    .single();
  if (ubicacionReadErr || !ubicacionRow) {
    return { success: false, error: "No se encontró la ubicación." };
  }
  await tagGpsSiFalta(supabase, ubicacionId, payload.gps, profile.id);

  // Equipo nuevo (equipoId null) se da de alta ahora — igual criterio que Racks/Tableros.
  const equipoIdPorIndice: (string | null)[] = [];
  for (const l of payload.lecturas) {
    if (l.equipoId) {
      equipoIdPorIndice.push(l.equipoId);
      continue;
    }
    const { data: nuevoEquipo, error: equipoErr } = await supabase
      .from("equipos")
      .insert({
        ubicacion_id: ubicacionId,
        categoria_equipo: l.categoriaEquipo,
        texto: l.texto.trim(),
        marca_modelo: l.marcaModelo.trim() || null,
        numero_serie: l.numeroSerie.trim() || null,
        etiqueta_ypf: l.etiquetaYpf.trim() || null,
        cantidad: Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 1,
        consumo_promedio_w: Number.isFinite(l.consumoPromedioW) && (l.consumoPromedioW as number) > 0 ? l.consumoPromedioW : null,
        consumo_max_w: Number.isFinite(l.consumoMaxW) && (l.consumoMaxW as number) > 0 ? l.consumoMaxW : null,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (equipoErr || !nuevoEquipo) {
      return { success: false, error: `No se pudo guardar el equipo "${l.texto}": ${equipoErr?.message ?? "error desconocido"}` };
    }
    equipoIdPorIndice.push(nuevoEquipo.id);
  }

  // N° de generación único (EQP-{año}-{4 dígitos}), con reintento ante colisión.
  let numeroGeneracion = nuevoNumeroGeneracionEquipo();
  let relevamientoId: string | null = null;
  for (let attempt = 0; attempt < 5 && !relevamientoId; attempt++) {
    const { data, error } = await supabase
      .from("equipo_relevamientos")
      .insert({
        ubicacion_id: ubicacionId,
        numero_generacion: numeroGeneracion,
        fecha: payload.fecha,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionEquipo();
        continue;
      }
      return { success: false, error: `No se pudo guardar el relevamiento: ${error.message}` };
    }
    relevamientoId = data!.id;
  }
  if (!relevamientoId) {
    return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };
  }

  const { error: lecturasErr } = await supabase.from("equipo_relevamiento_lecturas").insert(
    payload.lecturas.map((l, i) => ({
      relevamiento_id: relevamientoId!,
      equipo_id: equipoIdPorIndice[i]!,
      estado: l.estado || null,
      comentario: l.comentario.trim() || null,
    })),
  );
  if (lecturasErr) {
    return { success: false, error: `No se pudieron guardar las lecturas: ${lecturasErr.message}` };
  }

  // Foto general (opcional): registro + queda adjunta en el PDF. Reusa el
  // bucket informe-fotos, igual criterio que Tableros/Racks.
  let fotoGeneralBuffer: Buffer | null = null;
  if (fotoGeneral instanceof File) {
    fotoGeneralBuffer = Buffer.from(await fotoGeneral.arrayBuffer());
    const fotoPath = `${profile.id}/equipos/${relevamientoId}/general.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(fotoPath, fotoGeneralBuffer, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) {
      await supabase.from("equipo_relevamientos").update({ foto_general_url: fotoPath }).eq("id", relevamientoId);
    }
  }

  // Logo de la empresa (cabecera del PDF), igual que el resto de los módulos.
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

  const resumen = calcularResumenEquipos(payload.lecturas);

  const pdfBuffer = await renderEquipoPdf({
    numeroGeneracion,
    region: ubicacionRow.region,
    provincia: ubicacionRow.provincia,
    localidad: ubicacionRow.localidad,
    sitio: ubicacionRow.sitio,
    planta: ubicacionRow.planta,
    oficina: ubicacionRow.oficina,
    fecha: payload.fecha,
    resumen,
    fotoGeneralBuffer,
    lecturas: payload.lecturas.map((l) => ({
      categoriaEquipo: l.categoriaEquipo,
      texto: l.texto,
      marcaModelo: l.marcaModelo || null,
      numeroSerie: l.numeroSerie || null,
      cantidad: Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 1,
      estado: l.estado || null,
      comentario: l.comentario || null,
    })),
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildEquipoFilename({ numeroGeneracion, sitio: ubicacionRow.sitio });
  const pdfPath = `${profile.id}/equipos/${relevamientoId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await supabase
      .from("equipo_relevamientos")
      .update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() })
      .eq("id", relevamientoId);
    const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return { success: true, relevamientoId: relevamientoId!, numeroGeneracion, pdfUrl };
}
