"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { renderRackPdf } from "@/lib/pdf/render";
import { buildRackFilename } from "@/lib/pdf/filename";
import { calcularResumenEquipamiento } from "@/components/racks/types";
import type { EstadoChecklist } from "@/lib/database.types";

interface PayloadLectura {
  lecturaId: string;
  estado: string;
  comentario: string;
}
interface PayloadHallazgo {
  itemId: string;
  estado: EstadoChecklist | null;
  comentario: string;
}
interface Payload {
  fecha: string;
  lecturas: PayloadLectura[];
  hallazgos: PayloadHallazgo[];
}

export interface ActualizarRelevamientoResult {
  success: boolean;
  error?: string;
  pdfUrl?: string | null;
}

/**
 * Solo Administrador (ver eliminarRelevamientoRackAction para el mismo
 * criterio de admin-only + service role). Edita fecha + estado/comentario
 * de cada lectura ya cargada + hallazgos de Inspección IA — el rack, la
 * ubicación y el equipamiento (alta/baja de ítems) NO se tocan acá, mismo
 * alcance que ya usa la edición de Informe Técnico ("las fotos quedan como
 * están"): esto es para corregir datos cargados mal, no para rehacer el
 * relevamiento de cero. Las fotos generales ya guardadas se recuperan de
 * storage tal cual para no perderlas al regenerar el PDF.
 */
export async function actualizarRelevamientoRackAction(relevamientoId: string, formData: FormData): Promise<ActualizarRelevamientoResult> {
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
    .from("rack_relevamientos")
    .select("rack_id, numero_generacion, fotos_generales_urls")
    .eq("id", relevamientoId)
    .single();
  if (fetchErr || !relevamiento) return { success: false, error: "No se encontró el relevamiento." };

  const { data: rack, error: rackErr } = await supabase
    .from("racks")
    .select("denominacion, etiqueta_ypf, ubicacion_id")
    .eq("id", relevamiento.rack_id)
    .single();
  if (rackErr || !rack) return { success: false, error: "No se encontró el rack." };

  const { data: ubicacion, error: ubicacionErr } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", rack.ubicacion_id)
    .single();
  if (ubicacionErr || !ubicacion) return { success: false, error: "No se encontró la ubicación del rack." };

  const { error: updErr } = await supabase.from("rack_relevamientos").update({ fecha: payload.fecha }).eq("id", relevamientoId);
  if (updErr) return { success: false, error: `No se pudo actualizar el relevamiento: ${updErr.message}` };

  for (const l of payload.lecturas) {
    const { error } = await supabase
      .from("rack_relevamiento_lecturas")
      .update({ estado: l.estado || null, comentario: l.comentario.trim() || null })
      .eq("id", l.lecturaId);
    if (error) return { success: false, error: `No se pudo guardar una lectura: ${error.message}` };
  }

  // Hallazgos: se reemplazan enteros, mismo criterio que informe-técnico
  // (actualizarInformeTecnicoAction) y que la carga inicial de este módulo.
  await supabase.from("inspeccion_ia_hallazgos").delete().eq("modulo", "racks").eq("registro_id", relevamientoId);
  const hallazgosConfirmados = payload.hallazgos.filter((h) => h.estado);
  if (hallazgosConfirmados.length > 0) {
    const { error } = await supabase.from("inspeccion_ia_hallazgos").insert(
      hallazgosConfirmados.map((h) => ({
        modulo: "racks" as const,
        registro_id: relevamientoId,
        item_id: h.itemId,
        estado: h.estado!,
        comentario: h.comentario.trim() || null,
      })),
    );
    if (error) return { success: false, error: `No se pudieron guardar los hallazgos: ${error.message}` };
  }

  // Lecturas ya persistidas arriba — se vuelven a leer completas (con el
  // equipamiento) para rearmar el PDF con los valores ya corregidos.
  const { data: lecturasRows } = await supabase
    .from("rack_relevamiento_lecturas")
    .select("equipamiento_id, estado, comentario")
    .eq("relevamiento_id", relevamientoId);
  const equipamientoIds = (lecturasRows ?? []).map((l) => l.equipamiento_id);
  const { data: equipamientos } = equipamientoIds.length
    ? await supabase
        .from("rack_equipamientos")
        .select("numero, categoria_equipo, texto, marca_modelo, posicion_u, cantidad, bocas_disponibles")
        .in("id", equipamientoIds)
    : { data: [] };
  const equipoPorId = new Map((equipamientos ?? []).map((e, i) => [equipamientoIds[i], e]));
  const lecturasPdf = (lecturasRows ?? [])
    .map((l) => {
      const e = equipoPorId.get(l.equipamiento_id);
      if (!e) return null;
      return {
        numero: e.numero,
        categoriaEquipo: e.categoria_equipo,
        texto: e.texto,
        marcaModelo: e.marca_modelo,
        posicionU: e.posicion_u,
        cantidad: e.cantidad,
        bocasDisponibles: e.bocas_disponibles,
        estado: l.estado,
        comentario: l.comentario,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.numero - b.numero);

  const resumen = calcularResumenEquipamiento(lecturasPdf.map((l) => ({ categoriaEquipo: l.categoriaEquipo, cantidad: l.cantidad })));

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
      .map((h) => ({ texto: textoPorId.get(h.itemId), estado: h.estado!, comentario: h.comentario.trim() || null }))
      .filter((h): h is { texto: string; estado: EstadoChecklist; comentario: string | null } => !!h.texto);
  }

  // Fotos generales: quedan como estaban (sin UI para cambiarlas acá) — se
  // vuelven a bajar de storage para no perderlas al regenerar el PDF.
  const fotosGeneralesBuffers: Buffer[] = [];
  for (const path of relevamiento.fotos_generales_urls ?? []) {
    const { data: blob } = await supabase.storage.from("informe-fotos").download(path);
    if (blob) fotosGeneralesBuffers.push(Buffer.from(await blob.arrayBuffer()));
  }

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

  const pdfBuffer = await renderRackPdf({
    numeroGeneracion: relevamiento.numero_generacion,
    denominacion: rack.denominacion,
    etiquetaYpf: rack.etiqueta_ypf,
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

  const pdfFilename = buildRackFilename({ numeroGeneracion: relevamiento.numero_generacion, denominacion: rack.denominacion, sitio: ubicacion.sitio });
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

  const auditClient = await createClient();
  await logAudit(auditClient, profile, `Editó el relevamiento de rack ${relevamiento.numero_generacion}`);

  return { success: true, pdfUrl };
}
