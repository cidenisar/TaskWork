"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionTablero } from "@/lib/tableros/numero-generacion";
import { renderTableroPdf } from "@/lib/pdf/render";
import { buildTableroFilename } from "@/lib/pdf/filename";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { calcularResumenEquipamiento, itemMideCorriente } from "@/components/tableros/types";
import { construirUnifilar, agruparPorCuerpo } from "@/lib/tableros/unifilar";
import { drawCommandsToDxf } from "@/lib/dxf/writer";
import type { EstadoChecklist, TableroCategoriaEquipo, TableroEventoTipo, TableroJerarquia, TableroTipo, TableroTipoCircuito } from "@/lib/database.types";

interface PayloadHallazgo {
  itemId: string;
  estado: EstadoChecklist;
  comentario: string;
}

interface PayloadLectura {
  circuitoId: string | null;
  numero: number;
  texto: string;
  ampNominal: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  cuerpo: string;
  estado: string;
  corrienteF: string;
  corrienteR: string;
  corrienteS: string;
  corrienteT: string;
  comentario: string;
}

export interface CrearMedicionPayload {
  subsistemas: TableroTipo[];
  tipoEvento: TableroEventoTipo;
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  tableroId: string | null;
  denominacionNueva: string;
  jerarquiaNueva: TableroJerarquia | null;
  tableroPadreId: string | null;
  fecha: string;
  lecturas: PayloadLectura[];
  hallazgos?: PayloadHallazgo[];
}

export interface CrearMedicionResult {
  success: boolean;
  error?: string;
  medicionId?: string;
  numeroGeneracion?: string;
  pdfUrl?: string | null;
}

function parseNum(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
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
  const fotosGenerales = formData.getAll("fotoGeneral").filter((f): f is File => f instanceof File);

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
    const ubicacion = await resolverUbicacionId(supabase, payload, profile.id, "el tablero");
    if ("error" in ubicacion) return { success: false, error: ubicacion.error };

    const { data: nuevoTablero, error: tableroErr } = await supabase
      .from("tableros")
      .insert({
        subsistemas: payload.subsistemas,
        denominacion: payload.denominacionNueva.trim(),
        ubicacion_id: ubicacion.id,
        jerarquia: payload.jerarquiaNueva,
        tablero_padre_id: payload.jerarquiaNueva === "secundario" ? payload.tableroPadreId : null,
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
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", tableroRow.ubicacion_id)
    .single();
  if (ubicacionReadErr || !ubicacionTablero) {
    return { success: false, error: "No se encontró la ubicación del tablero." };
  }
  await tagGpsSiFalta(supabase, tableroRow.ubicacion_id, payload.gps, profile.id);

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
        cuerpo: l.cuerpo.trim() || null,
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

  // Hallazgos de seguridad (opcional): solo los que el técnico confirmó/corrigió
  // (estado no nulo) — ver catalogo_hallazgos_seguridad_tablero.
  if (payload.hallazgos && payload.hallazgos.length > 0) {
    await supabase.from("tablero_medicion_hallazgos").insert(
      payload.hallazgos.map((h) => ({
        medicion_id: medicionId!,
        item_id: h.itemId,
        estado: h.estado,
        comentario: h.comentario.trim() || null,
      })),
    );
  }

  // Fotos generales del tablero (opcionales, hasta TABLERO_FOTO_GENERAL_MAX):
  // registro + quedan adjuntas en el PDF — una por cada cuerpo, u otros
  // ángulos de detalle. Reusa el bucket informe-fotos ya existente. Una
  // foto que falla no debe tirar abajo toda la medición.
  const fotosGeneralesBuffers: Buffer[] = [];
  const fotosGeneralesPaths: string[] = [];
  for (let i = 0; i < fotosGenerales.length; i++) {
    const buffer = Buffer.from(await fotosGenerales[i].arrayBuffer());
    const fotoPath = `${profile.id}/tableros/${medicionId}/general-${i + 1}.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(fotoPath, buffer, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) {
      fotosGeneralesBuffers.push(buffer);
      fotosGeneralesPaths.push(fotoPath);
    }
  }
  if (fotosGeneralesPaths.length > 0) {
    await supabase.from("tablero_mediciones").update({ fotos_generales_urls: fotosGeneralesPaths }).eq("id", medicionId);
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

  const { data: calibreRes } = await supabase.from("catalogo_calibre_cable").select("amperaje_max, calibre_mm2");
  const configCalibre = (calibreRes ?? []).map((c) => ({ amperajeMax: Number(c.amperaje_max), calibreMm2: Number(c.calibre_mm2) }));
  const circuitosPorCuerpo = agruparPorCuerpo(
    payload.lecturas.map((l) => ({
      numero: l.numero,
      texto: l.texto,
      categoriaEquipo: l.categoriaEquipo,
      tipoCircuito: l.tipoCircuito,
      ampNominal: l.ampNominal || null,
      cuerpo: l.cuerpo.trim() || null,
    })),
  );
  const unifilar = construirUnifilar(circuitosPorCuerpo, configCalibre);

  const hallazgosConfirmados = (payload.hallazgos ?? []).filter((h) => h.estado);
  let hallazgosPdf: { texto: string; estado: EstadoChecklist; comentario: string | null }[] = [];
  if (hallazgosConfirmados.length > 0) {
    const { data: hallazgosCatalogo } = await supabase
      .from("catalogo_hallazgos_seguridad_tablero")
      .select("id, texto")
      .in(
        "id",
        hallazgosConfirmados.map((h) => h.itemId),
      );
    const textoPorId = new Map((hallazgosCatalogo ?? []).map((h) => [h.id, h.texto]));
    hallazgosPdf = hallazgosConfirmados
      .map((h) => ({ texto: textoPorId.get(h.itemId), estado: h.estado, comentario: h.comentario.trim() || null }))
      .filter((h): h is { texto: string; estado: EstadoChecklist; comentario: string | null } => !!h.texto);
  }

  const pdfBuffer = await renderTableroPdf({
    numeroGeneracion,
    subsistemas: tableroRow.subsistemas,
    tipoEvento: payload.tipoEvento,
    denominacion: tableroRow.denominacion,
    region: ubicacionTablero.region,
    provincia: ubicacionTablero.provincia,
    localidad: ubicacionTablero.localidad,
    sitio: ubicacionTablero.sitio,
    planta: ubicacionTablero.planta,
    oficina: ubicacionTablero.oficina,
    fecha: payload.fecha,
    resumen,
    fotosGeneralesBuffers,
    unifilar,
    hallazgos: hallazgosPdf,
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
    sitio: ubicacionTablero.sitio,
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

  // Esquema unifilar en DXF (mismo contenido que la sección del PDF, para
  // abrir en AutoCAD) — una falla acá no debe tirar abajo la medición, que
  // ya quedó guardada con su PDF.
  if (unifilar.commands.length > 0) {
    const dxfBuffer = drawCommandsToDxf(unifilar.commands, unifilar.height);
    const dxfPath = `${profile.id}/tableros/${medicionId}/plano.dxf`;
    const { error: dxfUpErr } = await supabase.storage
      .from("informes-pdf")
      .upload(dxfPath, dxfBuffer, { contentType: "application/dxf", upsert: true });
    if (!dxfUpErr) {
      await supabase.from("tablero_mediciones").update({ dxf_url: dxfPath }).eq("id", medicionId);
    }
  }

  return { success: true, medicionId: medicionId!, numeroGeneracion, pdfUrl };
}
