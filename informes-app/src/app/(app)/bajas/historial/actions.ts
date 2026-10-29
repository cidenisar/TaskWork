"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { puedeGestionarBajas } from "@/lib/types";
import { filenameDesdeStoragePath, buildBajaFilename } from "@/lib/pdf/filename";
import { renderBajaPdf } from "@/lib/pdf/render";
import { eliminarRegistroConArchivos, type EliminarResult } from "@/lib/admin/eliminar-registro";
import { TABLA_POR_TIPO } from "@/lib/equipamiento/resolver-equipo";
import { MOTIVO_BAJA_OPCIONES, TIPO_EQUIPO_BAJA_LABEL } from "@/components/bajas/types";
import type { MotivoBaja } from "@/lib/database.types";

export interface UrlArchivoResult {
  url: string | null;
  filename?: string;
  error?: string;
}

/** RLS (bajas_equipamiento_select) ya limita esto a Admin/Supervisor. */
export async function obtenerUrlPdfBajaAction(bajaId: string): Promise<UrlArchivoResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: baja, error } = await supabase.from("bajas_equipamiento").select("pdf_url").eq("id", bajaId).single();
  if (error || !baja?.pdf_url) {
    return { url: null, error: "El comprobante ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(baja.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(baja.pdf_url) };
}

export interface ConfirmarEntregaDepositoResult {
  success: boolean;
  error?: string;
}

/**
 * Confirma que un equipo ya dado de baja llegó físicamente al depósito —
 * evento separado de la baja en sí (que puede haber pasado días/semanas
 * antes, mientras el equipo esperaba en el sitio el próximo viaje). No
 * crea una fila nueva ni cambia `estado` (ya quedó en 'baja' desde el
 * alta): solo dos columnas de confirmación en el mismo registro, que ya
 * trae el sitio de origen.
 */
export async function confirmarEntregaDepositoAction(bajaId: string): Promise<ConfirmarEntregaDepositoResult> {
  const profile = await requireProfile();
  if (!puedeGestionarBajas(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede confirmar la entrega a depósito." };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("bajas_equipamiento")
    .update({ entregado_deposito_at: new Date().toISOString(), entregado_deposito_por: profile.id })
    .eq("id", bajaId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/bajas/historial");
  return { success: true };
}

/**
 * Solo Administrador. Borra la baja y su comprobante del storage, y
 * reactiva el equipo (vuelve a "activo") — si no, el equipo quedaría
 * marcado "baja" sin ningún registro que lo explique.
 */
export async function eliminarBajaAction(bajaId: string): Promise<EliminarResult> {
  const profile = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: baja } = await service
    .from("bajas_equipamiento")
    .select("pdf_url, equipo_texto, numero_generacion, tipo_equipo, equipo_id")
    .eq("id", bajaId)
    .single();

  const resultado = await eliminarRegistroConArchivos(
    service,
    profile,
    "bajas_equipamiento",
    bajaId,
    [{ bucket: "informes-pdf", path: baja?.pdf_url ?? null }],
    `Eliminó la baja de ${baja?.equipo_texto ?? bajaId} (${baja?.numero_generacion ?? ""})`,
  );
  if (!resultado.success) return resultado;

  if (baja?.tipo_equipo && baja.equipo_id) {
    await service.from(TABLA_POR_TIPO[baja.tipo_equipo]).update({ estado: "activo" }).eq("id", baja.equipo_id);
  }

  revalidatePath("/bajas/historial");
  return resultado;
}

export interface ActualizarBajaPayload {
  motivo: MotivoBaja;
  fecha: string;
  comentario: string;
}

export interface ActualizarBajaResult {
  success: boolean;
  error?: string;
}

/**
 * Solo Administrador. La identidad del equipo (texto/categoría/marca/
 * serie/etiqueta) es una foto fija de cómo estaba al momento de la baja —
 * acá solo se corrigen motivo/fecha/comentario, y se regenera el
 * comprobante con esos datos nuevos (sobrescribe el mismo archivo).
 */
export async function actualizarBajaAction(bajaId: string, payload: ActualizarBajaPayload): Promise<ActualizarBajaResult> {
  const profile = await requireAdmin();
  if (!MOTIVO_BAJA_OPCIONES.includes(payload.motivo)) return { success: false, error: "Motivo inválido." };
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  const service = createServiceRoleClient();

  const { data: baja, error: fetchErr } = await service
    .from("bajas_equipamiento")
    .select(
      "numero_generacion, tipo_equipo, equipo_texto, equipo_categoria, equipo_marca_modelo, equipo_numero_serie, equipo_etiqueta_ypf, ubicacion_id, pdf_url",
    )
    .eq("id", bajaId)
    .single();
  if (fetchErr || !baja) return { success: false, error: "No se encontró la baja." };

  const { error: updErr } = await service
    .from("bajas_equipamiento")
    .update({
      motivo: payload.motivo,
      fecha: payload.fecha,
      comentario: payload.comentario.trim() || null,
    })
    .eq("id", bajaId);
  if (updErr) return { success: false, error: `No se pudo actualizar la baja: ${updErr.message}` };

  const { data: ubicacion } = await service
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", baja.ubicacion_id)
    .single();
  if (!ubicacion) return { success: true }; // dato quedó guardado; sin ubicación no se puede regenerar el PDF

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

  const pdfBuffer = await renderBajaPdf({
    numeroGeneracion: baja.numero_generacion,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha: payload.fecha,
    tipoEquipoLabel: TIPO_EQUIPO_BAJA_LABEL[baja.tipo_equipo],
    categoriaLabel: baja.equipo_categoria,
    equipoTexto: baja.equipo_texto,
    marcaModelo: baja.equipo_marca_modelo,
    numeroSerie: baja.equipo_numero_serie,
    etiquetaYpf: baja.equipo_etiqueta_ypf,
    motivo: payload.motivo,
    comentario: payload.comentario.trim() || null,
    logoBuffer,
    appName: "TaskWork",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfPath = baja.pdf_url ?? `${profile.id}/bajas/${bajaId}/${buildBajaFilename({ numeroGeneracion: baja.numero_generacion, equipoTexto: baja.equipo_texto, sitio: ubicacion.sitio })}`;
  const { error: pdfUpErr } = await service.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr && !baja.pdf_url) {
    await service.from("bajas_equipamiento").update({ pdf_url: pdfPath }).eq("id", bajaId);
  }

  revalidatePath("/bajas/historial");
  return { success: true };
}
