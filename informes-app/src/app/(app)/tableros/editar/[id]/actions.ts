"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/config/audit";
import { renderTableroPdf } from "@/lib/pdf/render";
import { buildTableroFilename } from "@/lib/pdf/filename";
import { calcularResumenEquipamiento, itemMideCorriente } from "@/components/tableros/types";
import type { EstadoChecklist, TableroCategoriaEquipo, TableroEventoTipo, TableroTipoCircuito } from "@/lib/database.types";

interface PayloadLectura {
  circuitoId: string;
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
interface PayloadHallazgo {
  itemId: string;
  estado: EstadoChecklist;
  comentario: string;
}
interface Payload {
  fecha: string;
  tipoEvento: TableroEventoTipo;
  lecturas: PayloadLectura[];
  hallazgos: PayloadHallazgo[];
}

export interface ActualizarMedicionResult {
  success: boolean;
  error?: string;
  pdfUrl?: string | null;
}

function parseNum(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
}

/**
 * Edita una medición/relevamiento ya generado — solo Administrador (mismo
 * criterio que `eliminarMedicionAction`, ver ../../historial/actions.ts:
 * requireAdmin + service role, bypass total de RLS). A propósito NO toca
 * circuitos (son del tablero, no de esta visita), ni fotos generales
 * (quedan como estaban, mismo criterio que la edición de Informe Técnico),
 * ni dxf_url/unifilar_pdf_url/unifilar_estado — el plano unifilar, si lo
 * tenía, sigue intacto; regenerarlo es un pedido aparte y manual porque
 * cuesta tokens reales de IA (ver generarUnifilarAction).
 */
export async function actualizarMedicionTableroAction(medicionId: string, formData: FormData): Promise<ActualizarMedicionResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Datos inválidos." };
  }
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };
  if (!payload.lecturas.length) return { success: false, error: "La medición no tiene circuitos/elementos." };

  const { data: medicion, error: medicionErr } = await service
    .from("tablero_mediciones")
    .select("tablero_id, numero_generacion, fotos_generales_urls, pdf_url")
    .eq("id", medicionId)
    .single();
  if (medicionErr || !medicion) return { success: false, error: "No se encontró la medición." };

  const { data: tablero, error: tableroErr } = await service
    .from("tableros")
    .select("denominacion, subsistemas, ubicacion_id")
    .eq("id", medicion.tablero_id)
    .single();
  if (tableroErr || !tablero) return { success: false, error: "No se encontró el tablero de esta medición." };

  const { data: ubicacion, error: ubicacionErr } = await service
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", tablero.ubicacion_id)
    .single();
  if (ubicacionErr || !ubicacion) return { success: false, error: "No se encontró la ubicación del tablero." };

  const { error: updErr } = await service
    .from("tablero_mediciones")
    .update({ tipo_evento: payload.tipoEvento, fecha: payload.fecha })
    .eq("id", medicionId);
  if (updErr) return { success: false, error: `No se pudo actualizar la medición: ${updErr.message}` };

  // Lecturas: se reemplazan enteras (borrar + volver a insertar), mismo
  // criterio que técnicos/vehículos en la edición de Informe Técnico — acá
  // los circuitos no cambian entre visitas, así que no hay riesgo de perder
  // el encadenado ni nada que dependa del id del circuito.
  await service.from("tablero_medicion_lecturas").delete().eq("medicion_id", medicionId);
  const { error: lecturasErr } = await service.from("tablero_medicion_lecturas").insert(
    payload.lecturas.map((l) => {
      const mideCorriente = itemMideCorriente(l.categoriaEquipo, l.tipoCircuito, payload.tipoEvento);
      return {
        medicion_id: medicionId,
        circuito_id: l.circuitoId,
        estado: l.estado || null,
        corriente_f: mideCorriente ? parseNum(l.corrienteF) : null,
        corriente_r: mideCorriente ? parseNum(l.corrienteR) : null,
        corriente_s: mideCorriente ? parseNum(l.corrienteS) : null,
        corriente_t: mideCorriente ? parseNum(l.corrienteT) : null,
        comentario: l.comentario.trim() || null,
      };
    }),
  );
  if (lecturasErr) return { success: false, error: `No se pudieron guardar las lecturas: ${lecturasErr.message}` };

  await service.from("inspeccion_ia_hallazgos").delete().eq("modulo", "tableros").eq("registro_id", medicionId);
  if (payload.hallazgos.length > 0) {
    await service.from("inspeccion_ia_hallazgos").insert(
      payload.hallazgos.map((h) => ({
        modulo: "tableros" as const,
        registro_id: medicionId,
        item_id: h.itemId,
        estado: h.estado,
        comentario: h.comentario.trim() || null,
      })),
    );
  }

  // Fotos generales: quedan como estaban — se vuelven a traer de Storage
  // para que la regeneración del PDF no las pierda (mismo criterio que
  // informes_tecnicos/editar, "las fotos quedan como están").
  const fotosGeneralesBuffers: Buffer[] = [];
  for (const path of medicion.fotos_generales_urls ?? []) {
    const { data: blob } = await service.storage.from("informe-fotos").download(path);
    if (blob) fotosGeneralesBuffers.push(Buffer.from(await blob.arrayBuffer()));
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

  const resumen = calcularResumenEquipamiento(payload.lecturas);

  const hallazgosConfirmados = payload.hallazgos;
  let hallazgosPdf: { texto: string; estado: EstadoChecklist; comentario: string | null }[] = [];
  if (hallazgosConfirmados.length > 0) {
    const { data: hallazgosCatalogo } = await service
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

  const pdfBuffer = await renderTableroPdf({
    numeroGeneracion: medicion.numero_generacion,
    subsistemas: tablero.subsistemas,
    tipoEvento: payload.tipoEvento,
    denominacion: tablero.denominacion,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha: payload.fecha,
    resumen,
    fotosGeneralesBuffers,
    unifilarBloques: null,
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
    appName: "TaskWork",
    realizoNombre: profile.nombreCompleto,
  });

  // Mismo path que ya tenía (si lo tenía) para no dejar un archivo viejo
  // huérfano en Storage — si por algún motivo no lo tenía, se arma igual
  // que al crearla.
  const pdfPath =
    medicion.pdf_url ??
    `${profile.id}/tableros/${medicionId}/${buildTableroFilename({ numeroGeneracion: medicion.numero_generacion, denominacion: tablero.denominacion, sitio: ubicacion.sitio })}`;
  const { error: pdfUpErr } = await service.storage.from("informes-pdf").upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await service.from("tablero_mediciones").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", medicionId);
    const { data: signed } = await service.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  const supabase = await createClient();
  await logAudit(supabase, profile, `Editó la medición de tablero ${medicion.numero_generacion}`);

  revalidatePath("/tableros/historial");
  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true, pdfUrl };
}
