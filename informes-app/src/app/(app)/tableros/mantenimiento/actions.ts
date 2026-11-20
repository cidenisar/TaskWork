"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionMantenimientoTablero } from "@/lib/mantenimiento/numero-generacion";
import { renderMantenimientoPdf } from "@/lib/pdf/render";
import { buildMantenimientoFilename } from "@/lib/pdf/filename";
import { obtenerDestinatariosAutoEnvio } from "@/lib/email/destinatarios-auto-envio";
import { enviarPdfPorEmail } from "@/lib/email/enviar-pdf";

export interface CrearMantenimientoResult {
  success: boolean;
  error?: string;
}

/**
 * Registro de mantenimiento — no es una grilla por circuito como Medición/
 * Relevamiento, es un log de trabajo realizado (mismo criterio que
 * vehiculo_services): fecha + descripción, con circuito afectado y foto
 * opcionales, y una fecha de próximo mantenimiento opcional. Genera un PDF
 * simple (misma plantilla que Service de Vehículos y el Plan de
 * Mantenimiento genérico) y lo manda por mail — es un registro de trabajo
 * realizado igual que cualquier otro relevamiento.
 */
export async function crearMantenimientoAction(formData: FormData): Promise<CrearMantenimientoResult> {
  const profile = await requireProfile();

  const tableroId = String(formData.get("tableroId") || "");
  const circuitoId = String(formData.get("circuitoId") || "") || null;
  const fecha = String(formData.get("fecha") || "");
  const descripcion = String(formData.get("descripcion") || "").trim();
  const proximoMantenimiento = String(formData.get("proximoMantenimiento") || "") || null;
  const foto = formData.get("foto");

  if (!tableroId) return { success: false, error: "Falta el tablero." };
  if (!fecha) return { success: false, error: "Falta la fecha." };
  if (!descripcion) return { success: false, error: "Falta la descripción del trabajo realizado." };

  const supabase = await createClient();

  const { data: tablero } = await supabase.from("tableros").select("denominacion, ubicacion_id").eq("id", tableroId).single();
  if (!tablero) return { success: false, error: "No se encontró el tablero." };
  const { data: ubicacion } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", tablero.ubicacion_id)
    .single();

  let numeroGeneracion = nuevoNumeroGeneracionMantenimientoTablero();
  for (let intento = 0; intento < 5; intento++) {
    const { data: existente } = await supabase
      .from("tablero_mantenimientos")
      .select("id")
      .eq("numero_generacion", numeroGeneracion)
      .limit(1)
      .maybeSingle();
    if (!existente) break;
    numeroGeneracion = nuevoNumeroGeneracionMantenimientoTablero();
  }

  const { data: mantenimiento, error } = await supabase
    .from("tablero_mantenimientos")
    .insert({
      tablero_id: tableroId,
      circuito_id: circuitoId,
      fecha,
      descripcion,
      proximo_mantenimiento: proximoMantenimiento,
      numero_generacion: numeroGeneracion,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !mantenimiento) {
    return { success: false, error: `No se pudo guardar el mantenimiento: ${error?.message ?? "error desconocido"}` };
  }

  let fotoBuffer: Buffer | null = null;
  if (foto instanceof File && foto.size > 0) {
    fotoBuffer = Buffer.from(await foto.arrayBuffer());
    const path = `${profile.id}/tableros/mantenimiento/${mantenimiento.id}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("informe-fotos")
      .upload(path, fotoBuffer, { contentType: "image/jpeg", upsert: true });
    if (!upErr) {
      await supabase.from("tablero_mantenimientos").update({ foto_url: path }).eq("id", mantenimiento.id);
    } else {
      fotoBuffer = null;
    }
    // Una foto que falla no debe tirar abajo el registro del mantenimiento.
  }

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

  const pdfBuffer = await renderMantenimientoPdf({
    numeroGeneracion,
    documentoLabel: "MANTENIMIENTO DE TABLERO",
    contextoLabel: tablero.denominacion,
    region: ubicacion?.region ?? null,
    provincia: ubicacion?.provincia ?? null,
    localidad: ubicacion?.localidad ?? null,
    sitio: ubicacion?.sitio ?? null,
    planta: ubicacion?.planta ?? null,
    oficina: ubicacion?.oficina ?? null,
    fecha,
    descripcion,
    kilometraje: null,
    proximoMantenimiento,
    checklist: null,
    fotoBuffer,
    logoBuffer,
    appName: "TaskWork",
    realizoNombre: profile.nombreCompleto,
  });
  const pdfFilename = buildMantenimientoFilename({ numeroGeneracion, contexto: tablero.denominacion, sitio: ubicacion?.sitio });
  const pdfPath = `${profile.id}/tableros/mantenimiento/${mantenimiento.id}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await supabase.from("tablero_mantenimientos").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", mantenimiento.id);

    const destinatarios = await obtenerDestinatariosAutoEnvio(supabase);
    if (destinatarios.length > 0) {
      await enviarPdfPorEmail({
        to: destinatarios,
        asunto: `Mantenimiento de Tablero ${numeroGeneracion} — ${tablero.denominacion}`,
        texto: `Se registró un mantenimiento del tablero "${tablero.denominacion}" (${numeroGeneracion}). Se adjunta el PDF.`,
        pdfBuffer,
        filename: pdfFilename,
      });
    }
  }

  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true };
}
