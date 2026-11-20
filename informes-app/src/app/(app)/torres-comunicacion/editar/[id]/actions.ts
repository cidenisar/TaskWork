"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { renderTorreComunicacionPdf } from "@/lib/pdf/render";
import { buildTorreComunicacionFilename } from "@/lib/pdf/filename";
import { calcularResumenEquipamientoTorre } from "@/components/torres-comunicacion/types";
import type { EstadoChecklist, TorreComunicacionCategoriaEquipo } from "@/lib/database.types";

interface PayloadLectura {
  equipamientoId: string;
  estado: string;
  comentario: string;
}
interface PayloadHallazgo {
  itemId: string;
  estado: EstadoChecklist;
  comentario: string;
}
interface Payload {
  fecha: string;
  lecturas: PayloadLectura[];
  hallazgos?: PayloadHallazgo[];
}

export interface ActualizarRelevamientoTorreComunicacionResult {
  success: boolean;
  error?: string;
  pdfUrl?: string | null;
}

/**
 * Edita un relevamiento de torre YA GUARDADO — solo Administrador (ver
 * comentario de page.tsx sobre el alcance acotado: fecha + lecturas +
 * hallazgos, nunca los datos de la torre/equipamiento ni las fotos).
 * Usa la service role key desde el vamos porque esta pantalla es
 * admin-only (no hay RLS "own" que respetar acá, a diferencia de
 * Informe Técnico) — mismo criterio que eliminarRelevamientoTorreComunicacionAction.
 */
export async function actualizarRelevamientoTorreComunicacionAction(
  relevamientoId: string,
  formData: FormData,
): Promise<ActualizarRelevamientoTorreComunicacionResult> {
  const profile = await requireAdmin();
  const supabase = createServiceRoleClient();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Datos inválidos." };
  }
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  const { data: relevamiento, error: fetchErr } = await supabase
    .from("torre_comunicacion_relevamientos")
    .select("torre_id, numero_generacion, fotos_generales_urls")
    .eq("id", relevamientoId)
    .single();
  if (fetchErr || !relevamiento) return { success: false, error: "No se encontró el relevamiento." };

  const { data: torre } = await supabase
    .from("torres_comunicacion")
    .select("denominacion, tipo_torre, tramos_contados, altura_estimada_m, ubicacion_id")
    .eq("id", relevamiento.torre_id)
    .single();
  if (!torre) return { success: false, error: "No se encontró la torre." };

  const { data: ubicacion } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", torre.ubicacion_id)
    .single();
  if (!ubicacion) return { success: false, error: "No se encontró la ubicación de la torre." };

  // Equipamiento maestro de la torre, para completar categoría/cantidad del
  // resumen y del PDF a partir del equipamientoId que manda el cliente — no
  // se confía en el cliente para esos datos de identidad.
  const { data: equipamientoRows } = await supabase
    .from("torre_comunicacion_equipamientos")
    .select("id, numero, categoria_equipo, texto, marca_modelo, altura_m, cantidad")
    .eq("torre_id", relevamiento.torre_id);
  const equipoPorId = new Map((equipamientoRows ?? []).map((e) => [e.id, e]));

  const lecturasValidas = payload.lecturas.filter((l) => equipoPorId.has(l.equipamientoId));

  const { error: updErr } = await supabase.from("torre_comunicacion_relevamientos").update({ fecha: payload.fecha }).eq("id", relevamientoId);
  if (updErr) return { success: false, error: `No se pudo actualizar el relevamiento: ${updErr.message}` };

  // Lecturas: se reemplazan enteras (borrar + volver a insertar), igual
  // criterio que técnicos/vehículos en actualizarInformeTecnicoAction.
  await supabase.from("torre_comunicacion_relevamiento_lecturas").delete().eq("relevamiento_id", relevamientoId);
  if (lecturasValidas.length > 0) {
    const { error } = await supabase.from("torre_comunicacion_relevamiento_lecturas").insert(
      lecturasValidas.map((l) => ({
        relevamiento_id: relevamientoId,
        equipamiento_id: l.equipamientoId,
        estado: l.estado || null,
        comentario: l.comentario.trim() || null,
      })),
    );
    if (error) return { success: false, error: `No se pudieron guardar las lecturas: ${error.message}` };
  }

  await supabase.from("inspeccion_ia_hallazgos").delete().eq("modulo", "torres").eq("registro_id", relevamientoId);
  const hallazgosConfirmados = (payload.hallazgos ?? []).filter((h) => h.estado);
  if (hallazgosConfirmados.length > 0) {
    await supabase.from("inspeccion_ia_hallazgos").insert(
      hallazgosConfirmados.map((h) => ({
        modulo: "torres" as const,
        registro_id: relevamientoId,
        item_id: h.itemId,
        estado: h.estado,
        comentario: h.comentario.trim() || null,
      })),
    );
  }

  // Fotos generales: quedan como estaban — se vuelven a traer solo para no
  // perder esa sección del PDF al regenerarlo (mismo criterio que
  // actualizarInformeTecnicoAction con las fotos del informe).
  const fotosGeneralesBuffers: Buffer[] = [];
  for (const path of relevamiento.fotos_generales_urls ?? []) {
    const { data: blob } = await supabase.storage.from("informe-fotos").download(path);
    if (blob) fotosGeneralesBuffers.push(Buffer.from(await blob.arrayBuffer()));
  }

  let hallazgosPdf: { texto: string; estado: EstadoChecklist; comentario: string | null }[] = [];
  if (hallazgosConfirmados.length > 0) {
    const { data: hallazgosCatalogo } = await supabase
      .from("catalogo_inspeccion_ia")
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

  const lecturasPdf = lecturasValidas
    .map((l) => {
      const equipo = equipoPorId.get(l.equipamientoId)!;
      return {
        numero: equipo.numero,
        categoriaEquipo: equipo.categoria_equipo as TorreComunicacionCategoriaEquipo,
        texto: equipo.texto,
        marcaModelo: equipo.marca_modelo,
        alturaM: equipo.altura_m,
        cantidad: equipo.cantidad,
        estado: l.estado || null,
        comentario: l.comentario || null,
      };
    })
    .sort((a, b) => a.numero - b.numero);
  const resumen = calcularResumenEquipamientoTorre(
    lecturasValidas.map((l) => {
      const equipo = equipoPorId.get(l.equipamientoId)!;
      return { categoriaEquipo: equipo.categoria_equipo as TorreComunicacionCategoriaEquipo, cantidad: equipo.cantidad };
    }),
  );

  const { data: config } = await supabase.from("config_general").select("logo_empresa_url").eq("id", 1).single();
  let logoBuffer: Buffer | null = null;
  if (config?.logo_empresa_url) {
    try {
      const res = await fetch(config.logo_empresa_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // seguimos sin logo antes que fallar la regeneración del PDF
    }
  }

  const pdfBuffer = await renderTorreComunicacionPdf({
    numeroGeneracion: relevamiento.numero_generacion,
    denominacion: torre.denominacion,
    tipoTorre: torre.tipo_torre,
    tramosContados: torre.tramos_contados,
    alturaEstimadaM: torre.altura_estimada_m,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha: payload.fecha,
    resumen,
    fotosGeneralesBuffers,
    hallazgos: hallazgosPdf,
    lecturas: lecturasPdf,
    logoBuffer,
    appName: "TaskWork",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildTorreComunicacionFilename({
    numeroGeneracion: relevamiento.numero_generacion,
    denominacion: torre.denominacion,
    sitio: ubicacion.sitio,
  });
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

  const auditClient = await createClient();
  await logAudit(auditClient, profile, `Editó el relevamiento de torre de comunicaciones ${relevamiento.numero_generacion}`);

  return { success: true, pdfUrl };
}
