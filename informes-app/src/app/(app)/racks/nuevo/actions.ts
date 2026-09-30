"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionRack } from "@/lib/racks/numero-generacion";
import { renderRackPdf } from "@/lib/pdf/render";
import { buildRackFilename } from "@/lib/pdf/filename";
import { calcularResumenEquipamiento } from "@/components/racks/types";
import type { RackCategoriaEquipo } from "@/lib/database.types";

interface PayloadLectura {
  equipamientoId: string | null;
  numero: number;
  categoriaEquipo: RackCategoriaEquipo;
  texto: string;
  marcaModelo: string;
  posicionU: string;
  cantidad: number;
  estado: string;
  comentario: string;
}

interface PayloadUbicacionNueva {
  provincia: string;
  sectorOficina: string;
  sala: string;
}

export interface CrearRelevamientoPayload {
  rackId: string | null;
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  denominacionNueva: string;
  fecha: string;
  lecturas: PayloadLectura[];
}

export interface CrearRelevamientoResult {
  success: boolean;
  error?: string;
  numeroGeneracion?: string;
  pdfUrl?: string | null;
}

/**
 * Resuelve el id de la Ubicación a usar para un rack nuevo: la existente
 * elegida, o da de alta una nueva (alta al vuelo). Si ya existe una
 * Ubicación idéntica (misma provincia+sector/oficina+sala) la reusa en vez
 * de duplicarla — mismo criterio que Tableros/catalogo_clientes.
 */
async function resolverUbicacionId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Pick<CrearRelevamientoPayload, "ubicacionId" | "ubicacionNueva">,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  if (payload.ubicacionId) return { id: payload.ubicacionId };
  if (!payload.ubicacionNueva) return { error: "Elegí o creá una ubicación para el rack." };

  const provincia = payload.ubicacionNueva.provincia.trim();
  const sectorOficina = payload.ubicacionNueva.sectorOficina.trim();
  const sala = payload.ubicacionNueva.sala.trim();
  if (!provincia || !sala) return { error: "Completá la provincia y la sala de la ubicación nueva." };

  const { data: nueva, error } = await supabase
    .from("ubicaciones")
    .insert({ provincia, sector_oficina: sectorOficina || null, sala, created_by: userId })
    .select("id")
    .single();
  if (!error && nueva) return { id: nueva.id };

  if (error?.code === "23505") {
    let query = supabase.from("ubicaciones").select("id").eq("provincia", provincia).eq("sala", sala);
    query = sectorOficina ? query.eq("sector_oficina", sectorOficina) : query.is("sector_oficina", null);
    const { data: existente } = await query.single();
    if (existente) return { id: existente.id };
  }
  return { error: `No se pudo crear la ubicación: ${error?.message ?? "error desconocido"}` };
}

export async function crearRelevamientoRackAction(formData: FormData): Promise<CrearRelevamientoResult> {
  const profile = await requireProfile();

  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { success: false, error: "Faltan datos del relevamiento." };
  }
  let payload: CrearRelevamientoPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Faltan datos del relevamiento." };
  }
  const fotoGeneral = formData.get("fotoGeneral");

  if (!payload.lecturas.length) {
    return { success: false, error: "El rack no tiene equipamiento cargado." };
  }
  if (!payload.rackId && !payload.denominacionNueva.trim()) {
    return { success: false, error: "Completá la denominación del rack nuevo." };
  }
  if (!payload.fecha) {
    return { success: false, error: "Falta la fecha." };
  }

  const supabase = await createClient();

  // Rack: usa el existente, o lo da de alta ahora mismo (alta al vuelo,
  // igual criterio que Tableros — el técnico lo releva la primera vez que
  // lo encuentra en el sitio).
  let rackId = payload.rackId;
  if (!rackId) {
    const ubicacion = await resolverUbicacionId(supabase, payload, profile.id);
    if ("error" in ubicacion) return { success: false, error: ubicacion.error };

    const { data: nuevoRack, error: rackErr } = await supabase
      .from("racks")
      .insert({
        denominacion: payload.denominacionNueva.trim(),
        ubicacion_id: ubicacion.id,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (rackErr || !nuevoRack) {
      return { success: false, error: `No se pudo crear el rack: ${rackErr?.message ?? "error desconocido"}` };
    }
    rackId = nuevoRack.id;
  }

  const { data: rackRow, error: rackReadErr } = await supabase
    .from("racks")
    .select("denominacion, ubicacion_id")
    .eq("id", rackId)
    .single();
  if (rackReadErr || !rackRow) {
    return { success: false, error: "No se encontró el rack." };
  }
  const { data: ubicacionRack, error: ubicacionReadErr } = await supabase
    .from("ubicaciones")
    .select("provincia, sector_oficina, sala")
    .eq("id", rackRow.ubicacion_id)
    .single();
  if (ubicacionReadErr || !ubicacionRack) {
    return { success: false, error: "No se encontró la ubicación del rack." };
  }

  // Equipamiento nuevo (equipamientoId null) se da de alta ahora — igual
  // criterio que el rack en sí.
  const equipamientoIdPorIndice: (string | null)[] = [];
  for (const l of payload.lecturas) {
    if (l.equipamientoId) {
      equipamientoIdPorIndice.push(l.equipamientoId);
      continue;
    }
    const { data: nuevoEquipo, error: equipoErr } = await supabase
      .from("rack_equipamientos")
      .insert({
        rack_id: rackId,
        numero: l.numero,
        categoria_equipo: l.categoriaEquipo,
        texto: l.texto.trim(),
        marca_modelo: l.marcaModelo.trim() || null,
        posicion_u: l.posicionU.trim() || null,
        cantidad: Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 1,
      })
      .select("id")
      .single();
    if (equipoErr || !nuevoEquipo) {
      return { success: false, error: `No se pudo guardar el equipo "${l.texto}": ${equipoErr?.message ?? "error desconocido"}` };
    }
    equipamientoIdPorIndice.push(nuevoEquipo.id);
  }

  // N° de generación único (REL-{año}-{4 dígitos}), con reintento ante colisión.
  let numeroGeneracion = nuevoNumeroGeneracionRack();
  let relevamientoId: string | null = null;
  for (let attempt = 0; attempt < 5 && !relevamientoId; attempt++) {
    const { data, error } = await supabase
      .from("rack_relevamientos")
      .insert({
        rack_id: rackId,
        numero_generacion: numeroGeneracion,
        fecha: payload.fecha,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionRack();
        continue;
      }
      return { success: false, error: `No se pudo guardar el relevamiento: ${error.message}` };
    }
    relevamientoId = data!.id;
  }
  if (!relevamientoId) {
    return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };
  }

  const { error: lecturasErr } = await supabase.from("rack_relevamiento_lecturas").insert(
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

  // Foto general del rack (opcional): registro + queda adjunta en el PDF.
  // Reusa el bucket informe-fotos ya existente. Una foto que falla no debe
  // tirar abajo todo el relevamiento.
  let fotoGeneralBuffer: Buffer | null = null;
  if (fotoGeneral instanceof File) {
    fotoGeneralBuffer = Buffer.from(await fotoGeneral.arrayBuffer());
    const fotoPath = `${profile.id}/racks/${relevamientoId}/general.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(fotoPath, fotoGeneralBuffer, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) {
      await supabase.from("rack_relevamientos").update({ foto_general_url: fotoPath }).eq("id", relevamientoId);
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

  const resumen = calcularResumenEquipamiento(payload.lecturas);

  const pdfBuffer = await renderRackPdf({
    numeroGeneracion,
    denominacion: rackRow.denominacion,
    provincia: ubicacionRack.provincia,
    sectorOficina: ubicacionRack.sector_oficina,
    sala: ubicacionRack.sala,
    fecha: payload.fecha,
    resumen,
    fotoGeneralBuffer,
    lecturas: payload.lecturas.map((l) => ({
      numero: l.numero,
      categoriaEquipo: l.categoriaEquipo,
      texto: l.texto,
      marcaModelo: l.marcaModelo || null,
      posicionU: l.posicionU || null,
      cantidad: Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 1,
      estado: l.estado || null,
      comentario: l.comentario || null,
    })),
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildRackFilename({ numeroGeneracion, denominacion: rackRow.denominacion, sitio: ubicacionRack.sala });
  const pdfPath = `${profile.id}/racks/${relevamientoId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await supabase.from("rack_relevamientos").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", relevamientoId);
    const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return { success: true, numeroGeneracion, pdfUrl };
}
