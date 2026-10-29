"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { filenameDesdeStoragePath } from "@/lib/pdf/filename";
import { renderEntregaDepositoPdf } from "@/lib/pdf/render";
import { eliminarRegistroConArchivos, type EliminarResult } from "@/lib/admin/eliminar-registro";
import { MOTIVO_ENTREGA_OPCIONES, CONDICION_OPCIONES, TIPO_EQUIPO_LABEL } from "@/components/deposito/types";
import type { CondicionMaterial, MotivoEntregaDeposito } from "@/lib/database.types";

export interface UrlArchivoResult {
  url: string | null;
  filename?: string;
  error?: string;
}

/** RLS (entregas_deposito_select) ya limita esto a Admin/Supervisor. */
export async function obtenerUrlPdfEntregaAction(entregaId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: entrega, error } = await supabase.from("entregas_deposito").select("pdf_url").eq("id", entregaId).single();
  if (error || !entrega?.pdf_url) {
    return { url: null, error: "El comprobante ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(entrega.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(entrega.pdf_url) };
}

export interface UrlsFotosResult {
  urls: string[];
  error?: string;
}

/** RLS (entregas_deposito_select) ya limita esto a Admin/Supervisor. */
export async function obtenerUrlsFotosEvidenciaEntregaAction(entregaId: string): Promise<UrlsFotosResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: entrega, error } = await supabase.from("entregas_deposito").select("fotos_evidencia_urls").eq("id", entregaId).single();
  if (error || !entrega?.fotos_evidencia_urls || entrega.fotos_evidencia_urls.length === 0) {
    return { urls: [], error: "Las fotos ya no están disponibles." };
  }

  const urls: string[] = [];
  for (const path of entrega.fotos_evidencia_urls) {
    const { data: signed } = await supabase.storage.from("informe-fotos").createSignedUrl(path, 60 * 15);
    if (signed) urls.push(signed.signedUrl);
  }
  if (urls.length === 0) {
    return { urls: [], error: "No se pudo generar el link de las fotos." };
  }
  return { urls };
}

async function logoBufferActual(service: ReturnType<typeof createServiceRoleClient>): Promise<Buffer | null> {
  const { data: config } = await service.from("config_general").select("logo_empresa_url").eq("id", 1).single();
  if (!config?.logo_empresa_url) return null;
  try {
    const res = await fetch(config.logo_empresa_url);
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null; // seguimos sin logo antes que fallar la regeneración del PDF
  }
}

/**
 * Solo Administrador. Una entrega puede compartir el comprobante (PDF) y el
 * N° de generación con otras filas del mismo lote (ver crearEntregaDepositoLote)
 * — así que acá nunca se borra el archivo a ciegas: si quedan filas
 * hermanas, se regenera el PDF compartido sin este material; si esta era
 * la última, recién ahí se borra el archivo. Si la fila venía de un equipo
 * real (origen "equipo_existente"), ese equipo vuelve a quedar "activo".
 */
export async function eliminarEntregaAction(entregaId: string): Promise<EliminarResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: fila } = await service
    .from("entregas_deposito")
    .select("numero_generacion, descripcion, tipo_equipo, equipo_id, pdf_url, fotos_evidencia_urls")
    .eq("id", entregaId)
    .single();

  const resultado = await eliminarRegistroConArchivos(
    service,
    profile,
    "entregas_deposito",
    entregaId,
    [],
    `Eliminó la entrega a depósito de ${fila?.descripcion ?? entregaId}`,
  );
  if (!resultado.success || !fila) return resultado;

  if (fila.tipo_equipo && fila.equipo_id) {
    const { TABLA_POR_TIPO } = await import("@/lib/equipamiento/resolver-equipo");
    await service.from(TABLA_POR_TIPO[fila.tipo_equipo]).update({ estado: "activo" }).eq("id", fila.equipo_id);
  }

  const { data: filasRestantes } = await service
    .from("entregas_deposito")
    .select("tipo_equipo, descripcion, categoria, marca_modelo, numero_serie, etiqueta_ypf, cantidad, condicion, motivo, comentario, ubicacion_id, fecha")
    .eq("numero_generacion", fila.numero_generacion);

  if (!filasRestantes || filasRestantes.length === 0) {
    if (fila.pdf_url) await service.storage.from("informes-pdf").remove([fila.pdf_url]);
    if (fila.fotos_evidencia_urls?.length) await service.storage.from("informe-fotos").remove(fila.fotos_evidencia_urls);
    revalidatePath("/entregas-deposito/historial");
    return resultado;
  }

  if (fila.pdf_url) {
    const { data: ubicacion } = await service
      .from("ubicaciones")
      .select("region, provincia, localidad, sitio, planta, oficina")
      .eq("id", filasRestantes[0].ubicacion_id)
      .single();
    if (ubicacion) {
      const pdfBuffer = await renderEntregaDepositoPdf({
        numeroGeneracion: fila.numero_generacion,
        region: ubicacion.region,
        provincia: ubicacion.provincia,
        localidad: ubicacion.localidad,
        sitio: ubicacion.sitio,
        planta: ubicacion.planta,
        oficina: ubicacion.oficina,
        fecha: filasRestantes[0].fecha,
        items: filasRestantes.map((f) => ({
          tipoEquipoLabel: f.tipo_equipo ? TIPO_EQUIPO_LABEL[f.tipo_equipo] : null,
          descripcion: f.descripcion,
          categoria: f.categoria,
          marcaModelo: f.marca_modelo,
          numeroSerie: f.numero_serie,
          etiquetaYpf: f.etiqueta_ypf,
          cantidad: f.cantidad,
          condicion: f.condicion,
          motivo: f.motivo,
          comentario: f.comentario,
        })),
        fotosEvidenciaBuffers: null,
        logoBuffer: await logoBufferActual(service),
        appName: "TaskWork",
        realizoNombre: profile.nombreCompleto,
      });
      await service.storage.from("informes-pdf").upload(fila.pdf_url, pdfBuffer, { contentType: "application/pdf", upsert: true });
      await service.from("entregas_deposito").update({ pdf_generado_at: new Date().toISOString() }).eq("numero_generacion", fila.numero_generacion);
    }
  }

  revalidatePath("/entregas-deposito/historial");
  return resultado;
}

export interface ActualizarEntregaPayload {
  descripcion: string;
  categoria: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  condicion: CondicionMaterial;
  motivo: MotivoEntregaDeposito;
  comentario: string;
  fecha: string;
}

export interface ActualizarEntregaResult {
  success: boolean;
  error?: string;
}

/**
 * Solo Administrador. Edita una fila del lote y regenera el comprobante
 * compartido con TODAS las filas del mismo N° de generación (no solo
 * esta) — si no, se perderían los demás materiales del mismo PDF. La
 * fecha es del lote entero, así que se propaga a las filas hermanas.
 */
export async function actualizarEntregaAction(entregaId: string, payload: ActualizarEntregaPayload): Promise<ActualizarEntregaResult> {
  const profile = await requireAdmin();
  if (!payload.descripcion.trim()) return { success: false, error: "Falta la descripción." };
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };
  if (!CONDICION_OPCIONES.includes(payload.condicion)) return { success: false, error: "Condición inválida." };
  if (!MOTIVO_ENTREGA_OPCIONES.includes(payload.motivo)) return { success: false, error: "Motivo inválido." };

  const service = createServiceRoleClient();

  const { data: fila, error: fetchErr } = await service
    .from("entregas_deposito")
    .select("numero_generacion, ubicacion_id, pdf_url")
    .eq("id", entregaId)
    .single();
  if (fetchErr || !fila) return { success: false, error: "No se encontró la entrega." };

  const { error: updErr } = await service
    .from("entregas_deposito")
    .update({
      descripcion: payload.descripcion.trim(),
      categoria: payload.categoria.trim() || null,
      marca_modelo: payload.marcaModelo.trim() || null,
      numero_serie: payload.numeroSerie.trim() || null,
      etiqueta_ypf: payload.etiquetaYpf.trim() || null,
      cantidad: payload.cantidad || 1,
      condicion: payload.condicion,
      motivo: payload.motivo,
      comentario: payload.comentario.trim() || null,
      fecha: payload.fecha,
    })
    .eq("id", entregaId);
  if (updErr) return { success: false, error: `No se pudo actualizar la entrega: ${updErr.message}` };

  // La fecha es del lote entero (todas las filas del mismo numero_generacion la comparten) — se propaga.
  await service.from("entregas_deposito").update({ fecha: payload.fecha }).eq("numero_generacion", fila.numero_generacion).neq("id", entregaId);

  if (!fila.pdf_url) return { success: true };

  const { data: filasLote } = await service
    .from("entregas_deposito")
    .select("tipo_equipo, descripcion, categoria, marca_modelo, numero_serie, etiqueta_ypf, cantidad, condicion, motivo, comentario")
    .eq("numero_generacion", fila.numero_generacion);
  const { data: ubicacion } = await service
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", fila.ubicacion_id)
    .single();
  if (!filasLote || filasLote.length === 0 || !ubicacion) return { success: true };

  const pdfBuffer = await renderEntregaDepositoPdf({
    numeroGeneracion: fila.numero_generacion,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha: payload.fecha,
    items: filasLote.map((f) => ({
      tipoEquipoLabel: f.tipo_equipo ? TIPO_EQUIPO_LABEL[f.tipo_equipo] : null,
      descripcion: f.descripcion,
      categoria: f.categoria,
      marcaModelo: f.marca_modelo,
      numeroSerie: f.numero_serie,
      etiquetaYpf: f.etiqueta_ypf,
      cantidad: f.cantidad,
      condicion: f.condicion,
      motivo: f.motivo,
      comentario: f.comentario,
    })),
    fotosEvidenciaBuffers: null,
    logoBuffer: await logoBufferActual(service),
    appName: "TaskWork",
    realizoNombre: profile.nombreCompleto,
  });
  await service.storage.from("informes-pdf").upload(fila.pdf_url, pdfBuffer, { contentType: "application/pdf", upsert: true });
  await service.from("entregas_deposito").update({ pdf_generado_at: new Date().toISOString() }).eq("numero_generacion", fila.numero_generacion);

  revalidatePath("/entregas-deposito/historial");
  return { success: true };
}
