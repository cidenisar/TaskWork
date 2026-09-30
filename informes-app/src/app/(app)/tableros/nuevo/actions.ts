"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionTablero } from "@/lib/tableros/numero-generacion";
import { renderTableroPdf } from "@/lib/pdf/render";
import { buildTableroFilename } from "@/lib/pdf/filename";
import { calcularResumenEquipamiento, itemMideCorriente } from "@/components/tableros/types";
import type { TableroCategoriaEquipo, TableroEventoTipo, TableroTipo, TableroTipoCircuito } from "@/lib/database.types";

interface PayloadLectura {
  circuitoId: string | null;
  numero: number;
  texto: string;
  ampNominal: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  estado: string;
  corrienteF: string;
  corrienteR: string;
  corrienteS: string;
  corrienteT: string;
  comentario: string;
}

interface PayloadUbicacionNueva {
  provincia: string;
  sectorOficina: string;
  sala: string;
}

export interface CrearMedicionPayload {
  subsistemas: TableroTipo[];
  tipoEvento: TableroEventoTipo;
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  tableroId: string | null;
  denominacionNueva: string;
  fecha: string;
  lecturas: PayloadLectura[];
}

export interface CrearMedicionResult {
  success: boolean;
  error?: string;
  numeroGeneracion?: string;
  pdfUrl?: string | null;
}

function parseNum(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
}

/**
 * Resuelve el id de la Ubicación a usar para un tablero nuevo: la existente
 * elegida, o da de alta una nueva (alta al vuelo). Si ya existe una
 * Ubicación idéntica (misma provincia+sector/oficina+sala) la reusa en vez
 * de duplicarla — mismo criterio que catalogo_clientes/catalogo_torres.
 */
async function resolverUbicacionId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Pick<CrearMedicionPayload, "ubicacionId" | "ubicacionNueva">,
  userId: string,
): Promise<{ id: string } | { error: string }> {
  if (payload.ubicacionId) return { id: payload.ubicacionId };
  if (!payload.ubicacionNueva) return { error: "Elegí o creá una ubicación para el tablero." };

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

export async function crearMedicionTableroAction(formData: FormData): Promise<CrearMedicionResult> {
  const profile = await requireProfile();

  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { success: false, error: "Faltan datos de la medición." };
  }
  let payload: CrearMedicionPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Faltan datos de la medición." };
  }
  const fotoGeneral = formData.get("fotoGeneral");

  if (!payload.lecturas.length) {
    return { success: false, error: "El tablero no tiene circuitos/elementos cargados." };
  }
  if (!payload.tableroId && !payload.denominacionNueva.trim()) {
    return { success: false, error: "Completá la denominación del tablero nuevo." };
  }
  if (!payload.tableroId && payload.subsistemas.length === 0) {
    return { success: false, error: "Elegí al menos un subsistema para el tablero nuevo." };
  }
  if (!payload.fecha) {
    return { success: false, error: "Falta la fecha." };
  }

  const supabase = await createClient();

  // Tablero: usa el existente, o lo da de alta ahora mismo (alta al vuelo,
  // igual criterio que catalogo_clientes — el técnico lo releva la primera
  // vez que lo encuentra en el sitio).
  let tableroId = payload.tableroId;
  if (!tableroId) {
    const ubicacion = await resolverUbicacionId(supabase, payload, profile.id);
    if ("error" in ubicacion) return { success: false, error: ubicacion.error };

    const { data: nuevoTablero, error: tableroErr } = await supabase
      .from("tableros")
      .insert({
        subsistemas: payload.subsistemas,
        denominacion: payload.denominacionNueva.trim(),
        ubicacion_id: ubicacion.id,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (tableroErr || !nuevoTablero) {
      return { success: false, error: `No se pudo crear el tablero: ${tableroErr?.message ?? "error desconocido"}` };
    }
    tableroId = nuevoTablero.id;
  }

  const { data: tableroRow, error: tableroReadErr } = await supabase
    .from("tableros")
    .select("denominacion, subsistemas, ubicacion_id")
    .eq("id", tableroId)
    .single();
  if (tableroReadErr || !tableroRow) {
    return { success: false, error: "No se encontró el tablero." };
  }
  const { data: ubicacionTablero, error: ubicacionReadErr } = await supabase
    .from("ubicaciones")
    .select("provincia, sector_oficina, sala")
    .eq("id", tableroRow.ubicacion_id)
    .single();
  if (ubicacionReadErr || !ubicacionTablero) {
    return { success: false, error: "No se encontró la ubicación del tablero." };
  }

  // Circuitos nuevos (circuitoId null) se dan de alta ahora — igual criterio
  // que el tablero en sí: el técnico puede agregar un circuito que no
  // estaba relevado todavía sin tener que pasar antes por Configuración.
  const circuitoIdPorIndice: (string | null)[] = [];
  for (const l of payload.lecturas) {
    if (l.circuitoId) {
      circuitoIdPorIndice.push(l.circuitoId);
      continue;
    }
    const { data: nuevoCircuito, error: circErr } = await supabase
      .from("tablero_circuitos")
      .insert({
        tablero_id: tableroId,
        numero: l.numero,
        texto: l.texto.trim(),
        amp_nominal: l.ampNominal.trim() || null,
        categoria_equipo: l.categoriaEquipo,
        tipo_circuito: l.tipoCircuito,
      })
      .select("id")
      .single();
    if (circErr || !nuevoCircuito) {
      return { success: false, error: `No se pudo guardar el circuito "${l.texto}": ${circErr?.message ?? "error desconocido"}` };
    }
    circuitoIdPorIndice.push(nuevoCircuito.id);
  }

  // N° de generación único (TAB-{año}-{4 dígitos}), con reintento ante colisión.
  let numeroGeneracion = nuevoNumeroGeneracionTablero();
  let medicionId: string | null = null;
  for (let attempt = 0; attempt < 5 && !medicionId; attempt++) {
    const { data, error } = await supabase
      .from("tablero_mediciones")
      .insert({
        tablero_id: tableroId,
        numero_generacion: numeroGeneracion,
        tipo_evento: payload.tipoEvento,
        fecha: payload.fecha,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionTablero();
        continue;
      }
      return { success: false, error: `No se pudo guardar la medición: ${error.message}` };
    }
    medicionId = data!.id;
  }
  if (!medicionId) {
    return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };
  }

  // Cada elemento decide server-side (no solo en el formulario) si guarda
  // corriente por fase — en un tablero mixto, solo térmicas/disyuntores en
  // un circuito AC la llevan, y solo si la visita es de tipo Medición.
  const { error: lecturasErr } = await supabase.from("tablero_medicion_lecturas").insert(
    payload.lecturas.map((l, i) => {
      const mideCorriente = itemMideCorriente(l.categoriaEquipo, l.tipoCircuito, payload.tipoEvento);
      return {
        medicion_id: medicionId!,
        circuito_id: circuitoIdPorIndice[i]!,
        estado: l.estado || null,
        corriente_f: mideCorriente ? parseNum(l.corrienteF) : null,
        corriente_r: mideCorriente ? parseNum(l.corrienteR) : null,
        corriente_s: mideCorriente ? parseNum(l.corrienteS) : null,
        corriente_t: mideCorriente ? parseNum(l.corrienteT) : null,
        comentario: l.comentario.trim() || null,
      };
    }),
  );
  if (lecturasErr) {
    return { success: false, error: `No se pudieron guardar las lecturas: ${lecturasErr.message}` };
  }

  // Foto general del tablero (opcional): registro + queda adjunta en el PDF.
  // Reusa el bucket informe-fotos ya existente, no hace falta storage nuevo.
  // Una foto que falla no debe tirar abajo toda la medición.
  let fotoGeneralBuffer: Buffer | null = null;
  if (fotoGeneral instanceof File) {
    fotoGeneralBuffer = Buffer.from(await fotoGeneral.arrayBuffer());
    const fotoPath = `${profile.id}/tableros/${medicionId}/general.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(fotoPath, fotoGeneralBuffer, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) {
      await supabase.from("tablero_mediciones").update({ foto_general_url: fotoPath }).eq("id", medicionId);
    }
  }

  // Logo de la empresa (cabecera del PDF), igual que Informe Técnico/Rendición.
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

  const pdfBuffer = await renderTableroPdf({
    numeroGeneracion,
    subsistemas: tableroRow.subsistemas,
    tipoEvento: payload.tipoEvento,
    denominacion: tableroRow.denominacion,
    provincia: ubicacionTablero.provincia,
    sectorOficina: ubicacionTablero.sector_oficina,
    sala: ubicacionTablero.sala,
    fecha: payload.fecha,
    resumen,
    fotoGeneralBuffer,
    lecturas: payload.lecturas.map((l) => {
      const mideCorriente = itemMideCorriente(l.categoriaEquipo, l.tipoCircuito, payload.tipoEvento);
      return {
        numero: l.numero,
        texto: l.texto,
        categoriaEquipo: l.categoriaEquipo,
        tipoCircuito: l.tipoCircuito,
        ampNominal: l.ampNominal || null,
        estado: l.estado || null,
        corrienteF: mideCorriente ? parseNum(l.corrienteF) : null,
        corrienteR: mideCorriente ? parseNum(l.corrienteR) : null,
        corrienteS: mideCorriente ? parseNum(l.corrienteS) : null,
        corrienteT: mideCorriente ? parseNum(l.corrienteT) : null,
        comentario: l.comentario || null,
      };
    }),
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildTableroFilename({
    numeroGeneracion,
    denominacion: tableroRow.denominacion,
    sitio: ubicacionTablero.sala,
  });
  const pdfPath = `${profile.id}/tableros/${medicionId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await supabase.from("tablero_mediciones").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", medicionId);
    const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return { success: true, numeroGeneracion, pdfUrl };
}
