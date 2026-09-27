"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionTablero } from "@/lib/tableros/numero-generacion";
import { renderTableroPdf } from "@/lib/pdf/render";
import { buildTableroFilename } from "@/lib/pdf/filename";
import type { TableroTipo } from "@/lib/database.types";

interface PayloadLectura {
  circuitoId: string | null;
  numero: number;
  texto: string;
  ampNominal: string;
  estado: string;
  corrienteF: string;
  corrienteR: string;
  corrienteS: string;
  corrienteT: string;
  comentario: string;
}

export interface CrearMedicionPayload {
  tipo: TableroTipo;
  tableroId: string | null;
  denominacionNueva: string;
  sitioNuevo: string;
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

export async function crearMedicionTableroAction(payload: CrearMedicionPayload): Promise<CrearMedicionResult> {
  const profile = await requireProfile();

  if (!payload.lecturas.length) {
    return { success: false, error: "El tablero no tiene circuitos/elementos cargados." };
  }
  if (!payload.tableroId && (!payload.denominacionNueva.trim() || !payload.sitioNuevo.trim())) {
    return { success: false, error: "Completá la denominación y el sitio del tablero nuevo." };
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
    const { data: nuevoTablero, error: tableroErr } = await supabase
      .from("tableros")
      .insert({
        tipo: payload.tipo,
        denominacion: payload.denominacionNueva.trim(),
        sitio: payload.sitioNuevo.trim(),
        created_by: profile.id,
      })
      .select("id, denominacion, sitio")
      .single();
    if (tableroErr || !nuevoTablero) {
      return { success: false, error: `No se pudo crear el tablero: ${tableroErr?.message ?? "error desconocido"}` };
    }
    tableroId = nuevoTablero.id;
  }

  const { data: tableroRow, error: tableroReadErr } = await supabase
    .from("tableros")
    .select("denominacion, sitio")
    .eq("id", tableroId)
    .single();
  if (tableroReadErr || !tableroRow) {
    return { success: false, error: "No se encontró el tablero." };
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
      .insert({ tablero_id: tableroId, numero_generacion: numeroGeneracion, fecha: payload.fecha, created_by: profile.id })
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

  const { error: lecturasErr } = await supabase.from("tablero_medicion_lecturas").insert(
    payload.lecturas.map((l, i) => ({
      medicion_id: medicionId!,
      circuito_id: circuitoIdPorIndice[i]!,
      estado: l.estado || null,
      corriente_f: parseNum(l.corrienteF),
      corriente_r: parseNum(l.corrienteR),
      corriente_s: parseNum(l.corrienteS),
      corriente_t: parseNum(l.corrienteT),
      comentario: l.comentario.trim() || null,
    })),
  );
  if (lecturasErr) {
    return { success: false, error: `No se pudieron guardar las lecturas: ${lecturasErr.message}` };
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

  const pdfBuffer = await renderTableroPdf({
    numeroGeneracion,
    tipo: payload.tipo,
    denominacion: tableroRow.denominacion,
    sitio: tableroRow.sitio,
    fecha: payload.fecha,
    lecturas: payload.lecturas.map((l) => ({
      numero: l.numero,
      texto: l.texto,
      ampNominal: l.ampNominal || null,
      estado: l.estado || null,
      corrienteF: parseNum(l.corrienteF),
      corrienteR: parseNum(l.corrienteR),
      corrienteS: parseNum(l.corrienteS),
      corrienteT: parseNum(l.corrienteT),
      comentario: l.comentario || null,
    })),
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildTableroFilename({ numeroGeneracion, denominacion: tableroRow.denominacion, sitio: tableroRow.sitio });
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
