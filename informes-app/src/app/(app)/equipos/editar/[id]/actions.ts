"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { renderEquipoPdf } from "@/lib/pdf/render";
import { buildEquipoFilename } from "@/lib/pdf/filename";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { calcularResumenEquipos } from "@/components/equipos/types";
import { logAudit } from "@/lib/config/audit";
import type { EquipoCategoria, EstadoChecklist, TipoMontajeCamara } from "@/lib/database.types";

interface PayloadLecturaEditable {
  lecturaId: string;
  equipoId: string;
  categoriaEquipo: EquipoCategoria;
  texto: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  tipoMontaje: TipoMontajeCamara | null;
  alturaMontajeM: number | null;
  estado: string;
  comentario: string;
  /** true = sacarla de este relevamiento (no borra el equipo en sí, solo la lectura). */
  eliminada: boolean;
}

export interface ActualizarRelevamientoEquiposPayload {
  ubicacionId: string;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  fecha: string;
  lecturas: PayloadLecturaEditable[];
}

export interface ActualizarRelevamientoEquiposResult {
  success: boolean;
  error?: string;
  pdfUrl?: string | null;
}

/**
 * Solo Administrador (editar, a diferencia de crear, no es "lo propio" —
 * ver requireAdmin + service role, mismo criterio que eliminarRegistro).
 * Alcance deliberadamente más chico que "nuevo": acá se corrigen los datos
 * de los equipos ya cargados (texto, marca, serie, estado, comentario,
 * ubicación, fecha) y se puede sacar una lectura del relevamiento — no se
 * agregan equipos nuevos ni se vuelve a correr la lectura por IA ni la
 * búsqueda en depósito (eso es "Nuevo relevamiento"), mismo criterio que
 * ya usa actualizarInformeTecnicoAction ("las fotos quedan como están").
 */
export async function actualizarRelevamientoEquiposAction(
  relevamientoId: string,
  formData: FormData,
): Promise<ActualizarRelevamientoEquiposResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  let payload: ActualizarRelevamientoEquiposPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Datos inválidos." };
  }
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };
  const vigentes = payload.lecturas.filter((l) => !l.eliminada);
  if (vigentes.length === 0) return { success: false, error: "El relevamiento no puede quedar sin equipos — no se puede sacar el último." };

  const { data: relevamientoActual, error: fetchErr } = await service
    .from("equipo_relevamientos")
    .select("numero_generacion, pdf_url, foto_general_url, created_by")
    .eq("id", relevamientoId)
    .single();
  if (fetchErr || !relevamientoActual) return { success: false, error: "No se encontró el relevamiento." };
  const numeroGeneracion = relevamientoActual.numero_generacion;

  const ubicacion = await resolverUbicacionId(
    service,
    { ubicacionId: payload.ubicacionId !== "__new" ? payload.ubicacionId : null, ubicacionNueva: payload.ubicacionId === "__new" ? payload.ubicacionNueva : null },
    profile.id,
    "el relevamiento",
  );
  if ("error" in ubicacion) return { success: false, error: ubicacion.error };
  const ubicacionId = ubicacion.id;
  await tagGpsSiFalta(service, ubicacionId, payload.gps, profile.id);

  const { data: ubicacionRow, error: ubicacionReadErr } = await service
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", ubicacionId)
    .single();
  if (ubicacionReadErr || !ubicacionRow) return { success: false, error: "No se encontró la ubicación." };

  await service.from("equipo_relevamientos").update({ ubicacion_id: ubicacionId, fecha: payload.fecha }).eq("id", relevamientoId);

  for (const l of payload.lecturas) {
    if (l.eliminada) {
      await service.from("equipo_relevamiento_lecturas").delete().eq("id", l.lecturaId);
      continue;
    }
    const { error: equipoErr } = await service
      .from("equipos")
      .update({
        categoria_equipo: l.categoriaEquipo,
        texto: l.texto.trim(),
        marca_modelo: l.marcaModelo.trim() || null,
        numero_serie: l.numeroSerie.trim() || null,
        etiqueta_ypf: l.etiquetaYpf.trim() || null,
        cantidad: Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 1,
        consumo_promedio_w: Number.isFinite(l.consumoPromedioW) && (l.consumoPromedioW as number) > 0 ? l.consumoPromedioW : null,
        consumo_max_w: Number.isFinite(l.consumoMaxW) && (l.consumoMaxW as number) > 0 ? l.consumoMaxW : null,
        tipo_montaje: l.tipoMontaje,
        altura_montaje_m: Number.isFinite(l.alturaMontajeM) && (l.alturaMontajeM as number) >= 0 ? l.alturaMontajeM : null,
      })
      .eq("id", l.equipoId);
    if (equipoErr) return { success: false, error: `No se pudo actualizar "${l.texto}": ${equipoErr.message}` };

    const { error: lecturaErr } = await service
      .from("equipo_relevamiento_lecturas")
      .update({ estado: l.estado || null, comentario: l.comentario.trim() || null })
      .eq("id", l.lecturaId);
    if (lecturaErr) return { success: false, error: `No se pudo actualizar la lectura de "${l.texto}": ${lecturaErr.message}` };
  }

  // Foto general e Inspección IA: "quedan como están" (mismo criterio que
  // actualizarInformeTecnicoAction) — se recuperan tal cual para que la
  // regeneración del PDF no las pierda, sin UI para tocarlas acá.
  let fotoGeneralBuffer: Buffer | null = null;
  if (relevamientoActual.foto_general_url) {
    const { data: blob } = await service.storage.from("informe-fotos").download(relevamientoActual.foto_general_url);
    if (blob) fotoGeneralBuffer = Buffer.from(await blob.arrayBuffer());
  }

  const { data: hallazgosRows } = await service
    .from("inspeccion_ia_hallazgos")
    .select("item_id, estado, comentario")
    .eq("modulo", "equipos")
    .eq("registro_id", relevamientoId);
  let hallazgosPdf: { texto: string; estado: EstadoChecklist; comentario: string | null }[] = [];
  if (hallazgosRows && hallazgosRows.length > 0) {
    const { data: hallazgosCatalogo } = await service
      .from("catalogo_inspeccion_ia")
      .select("id, texto")
      .in("id", hallazgosRows.map((h) => h.item_id));
    const textoPorId = new Map((hallazgosCatalogo ?? []).map((h) => [h.id, h.texto]));
    hallazgosPdf = hallazgosRows
      .map((h) => ({ texto: textoPorId.get(h.item_id), estado: h.estado, comentario: h.comentario }))
      .filter((h): h is { texto: string; estado: EstadoChecklist; comentario: string | null } => !!h.texto);
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

  const resumen = calcularResumenEquipos(vigentes);
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
    hallazgos: hallazgosPdf,
    lecturas: vigentes.map((l) => ({
      categoriaEquipo: l.categoriaEquipo,
      texto: l.texto,
      marcaModelo: l.marcaModelo || null,
      numeroSerie: l.numeroSerie || null,
      cantidad: Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 1,
      estado: l.estado || null,
      comentario: l.comentario || null,
    })),
    logoBuffer,
    appName: "TaskWork",
    realizoNombre: profile.nombreCompleto,
  });

  // Mismo path que ya tenía (o uno nuevo bajo el dueño original si todavía
  // no se había generado ninguno) — nunca bajo el id del admin que edita,
  // para no dejar un archivo huérfano aparte del que ya conocía la fila.
  const pdfPath = relevamientoActual.pdf_url ?? `${relevamientoActual.created_by}/equipos/${relevamientoId}/${buildEquipoFilename({ numeroGeneracion, sitio: ubicacionRow.sitio })}`;
  const { error: pdfUpErr } = await service.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await service.from("equipo_relevamientos").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", relevamientoId);
    const { data: signed } = await service.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  const supabase = await createClient();
  await logAudit(supabase, profile, `Editó el relevamiento de equipos ${numeroGeneracion}`);
  return { success: true, pdfUrl };
}
