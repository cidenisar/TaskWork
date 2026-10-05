"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionTorreComunicacion } from "@/lib/torres-comunicacion/numero-generacion";
import { renderTorreComunicacionPdf } from "@/lib/pdf/render";
import { buildTorreComunicacionFilename } from "@/lib/pdf/filename";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { calcularResumenEquipamientoTorre } from "@/components/torres-comunicacion/types";
import type { TorreComunicacionCategoriaEquipo } from "@/lib/database.types";

interface PayloadLectura {
  equipamientoId: string | null;
  numero: number;
  categoriaEquipo: TorreComunicacionCategoriaEquipo;
  texto: string;
  marcaModelo: string;
  alturaM: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  estado: string;
  comentario: string;
}

export interface CrearRelevamientoTorreComunicacionPayload {
  torreId: string | null;
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  denominacionNueva: string;
  fecha: string;
  lecturas: PayloadLectura[];
}

export interface CrearRelevamientoTorreComunicacionResult {
  success: boolean;
  error?: string;
  relevamientoId?: string;
  numeroGeneracion?: string;
  pdfUrl?: string | null;
}

export async function crearRelevamientoTorreComunicacionAction(formData: FormData): Promise<CrearRelevamientoTorreComunicacionResult> {
  const profile = await requireProfile();

  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { success: false, error: "Faltan datos del relevamiento." };
  }
  let payload: CrearRelevamientoTorreComunicacionPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Faltan datos del relevamiento." };
  }
  const fotosGenerales = formData.getAll("fotoGeneral").filter((f): f is File => f instanceof File);

  if (!payload.lecturas.length) {
    return { success: false, error: "La torre no tiene equipamiento cargado." };
  }
  if (!payload.torreId && !payload.denominacionNueva.trim()) {
    return { success: false, error: "Completá la denominación de la torre nueva." };
  }
  if (!payload.fecha) {
    return { success: false, error: "Falta la fecha." };
  }

  const supabase = await createClient();

  // Torre: usa la existente, o la da de alta ahora mismo (alta al vuelo,
  // igual criterio que Racks — el técnico la releva la primera vez que la
  // encuentra en el sitio).
  let torreId = payload.torreId;
  if (!torreId) {
    const ubicacion = await resolverUbicacionId(supabase, payload, profile.id, "la torre");
    if ("error" in ubicacion) return { success: false, error: ubicacion.error };

    const { data: nuevaTorre, error: torreErr } = await supabase
      .from("torres_comunicacion")
      .insert({
        denominacion: payload.denominacionNueva.trim(),
        ubicacion_id: ubicacion.id,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (torreErr || !nuevaTorre) {
      return { success: false, error: `No se pudo crear la torre: ${torreErr?.message ?? "error desconocido"}` };
    }
    torreId = nuevaTorre.id;
  }

  const { data: torreRow, error: torreReadErr } = await supabase
    .from("torres_comunicacion")
    .select("denominacion, ubicacion_id")
    .eq("id", torreId)
    .single();
  if (torreReadErr || !torreRow) {
    return { success: false, error: "No se encontró la torre." };
  }
  const { data: ubicacionTorre, error: ubicacionReadErr } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", torreRow.ubicacion_id)
    .single();
  if (ubicacionReadErr || !ubicacionTorre) {
    return { success: false, error: "No se encontró la ubicación de la torre." };
  }
  await tagGpsSiFalta(supabase, torreRow.ubicacion_id, payload.gps, profile.id);

  // Equipamiento nuevo (equipamientoId null) se da de alta ahora — igual
  // criterio que la torre en sí.
  const equipamientoIdPorIndice: (string | null)[] = [];
  for (const l of payload.lecturas) {
    if (l.equipamientoId) {
      equipamientoIdPorIndice.push(l.equipamientoId);
      continue;
    }
    const { data: nuevoEquipo, error: equipoErr } = await supabase
      .from("torre_comunicacion_equipamientos")
      .insert({
        torre_id: torreId,
        numero: l.numero,
        categoria_equipo: l.categoriaEquipo,
        texto: l.texto.trim(),
        marca_modelo: l.marcaModelo.trim() || null,
        altura_m: l.alturaM.trim() || null,
        etiqueta_ypf: l.etiquetaYpf.trim() || null,
        cantidad: Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 1,
        consumo_promedio_w: Number.isFinite(l.consumoPromedioW) && (l.consumoPromedioW as number) > 0 ? l.consumoPromedioW : null,
        consumo_max_w: Number.isFinite(l.consumoMaxW) && (l.consumoMaxW as number) > 0 ? l.consumoMaxW : null,
      })
      .select("id")
      .single();
    if (equipoErr || !nuevoEquipo) {
      return { success: false, error: `No se pudo guardar el equipo "${l.texto}": ${equipoErr?.message ?? "error desconocido"}` };
    }
    equipamientoIdPorIndice.push(nuevoEquipo.id);
  }

  // N° de generación único (TOC-{año}-{4 dígitos}), con reintento ante colisión.
  let numeroGeneracion = nuevoNumeroGeneracionTorreComunicacion();
  let relevamientoId: string | null = null;
  for (let attempt = 0; attempt < 5 && !relevamientoId; attempt++) {
    const { data, error } = await supabase
      .from("torre_comunicacion_relevamientos")
      .insert({
        torre_id: torreId,
        numero_generacion: numeroGeneracion,
        fecha: payload.fecha,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionTorreComunicacion();
        continue;
      }
      return { success: false, error: `No se pudo guardar el relevamiento: ${error.message}` };
    }
    relevamientoId = data!.id;
  }
  if (!relevamientoId) {
    return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };
  }

  const { error: lecturasErr } = await supabase.from("torre_comunicacion_relevamiento_lecturas").insert(
    payload.lecturas.map((l, i) => ({
      relevamiento_id: relevamientoId!,
      equipamiento_id: equipamientoIdPorIndice[i]!,
      estado: l.estado || null,
      comentario: l.comentario.trim() || null,
    })),
  );
  if (lecturasErr) {
    return { success: false, error: `No se pudieron guardar las lecturas: ${lecturasErr.message}` };
  }

  // Fotos generales de la torre (opcionales, hasta TORRE_FOTO_GENERAL_MAX):
  // registro + quedan adjuntas en el PDF. Reusa el bucket informe-fotos ya
  // existente. Una foto que falla no debe tirar abajo todo el relevamiento.
  const fotosGeneralesBuffers: Buffer[] = [];
  const fotosGeneralesPaths: string[] = [];
  for (let i = 0; i < fotosGenerales.length; i++) {
    const buffer = Buffer.from(await fotosGenerales[i].arrayBuffer());
    const fotoPath = `${profile.id}/torres-comunicacion/${relevamientoId}/general-${i + 1}.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(fotoPath, buffer, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) {
      fotosGeneralesBuffers.push(buffer);
      fotosGeneralesPaths.push(fotoPath);
    }
  }
  if (fotosGeneralesPaths.length > 0) {
    await supabase.from("torre_comunicacion_relevamientos").update({ fotos_generales_urls: fotosGeneralesPaths }).eq("id", relevamientoId);
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

  const resumen = calcularResumenEquipamientoTorre(payload.lecturas);

  const pdfBuffer = await renderTorreComunicacionPdf({
    numeroGeneracion,
    denominacion: torreRow.denominacion,
    region: ubicacionTorre.region,
    provincia: ubicacionTorre.provincia,
    localidad: ubicacionTorre.localidad,
    sitio: ubicacionTorre.sitio,
    planta: ubicacionTorre.planta,
    oficina: ubicacionTorre.oficina,
    fecha: payload.fecha,
    resumen,
    fotosGeneralesBuffers,
    lecturas: payload.lecturas.map((l) => ({
      numero: l.numero,
      categoriaEquipo: l.categoriaEquipo,
      texto: l.texto,
      marcaModelo: l.marcaModelo || null,
      alturaM: l.alturaM || null,
      cantidad: Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 1,
      estado: l.estado || null,
      comentario: l.comentario || null,
    })),
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildTorreComunicacionFilename({ numeroGeneracion, denominacion: torreRow.denominacion, sitio: ubicacionTorre.sitio });
  const pdfPath = `${profile.id}/torres-comunicacion/${relevamientoId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await supabase
      .from("torre_comunicacion_relevamientos")
      .update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() })
      .eq("id", relevamientoId);
    const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return { success: true, relevamientoId: relevamientoId!, numeroGeneracion, pdfUrl };
}
