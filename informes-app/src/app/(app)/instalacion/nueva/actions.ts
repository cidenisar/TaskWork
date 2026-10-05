"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { nuevoNumeroGeneracionInstalacion } from "@/lib/instalacion/numero-generacion";
import { crearEntregaDepositoLote, type MaterialLoteDeposito } from "@/lib/deposito/crear-lote";
import { renderInstalacionPdf } from "@/lib/pdf/render";
import { buildInstalacionFilename } from "@/lib/pdf/filename";

interface PayloadMaterial {
  descripcion: string;
  categoria: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  comentario: string;
}

interface PayloadRemitoItem {
  descripcion: string;
  cantidadEsperada: number;
  cantidadSobrante: number;
}

export interface CrearInstalacionPayload {
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  fecha: string;
  materiales: PayloadMaterial[];
  remitoNumero: string | null;
  remitoItems: PayloadRemitoItem[];
}

export interface CrearInstalacionResult {
  success: boolean;
  error?: string;
  numeroGeneracion?: string;
  entregaDepositoNumeroGeneracion?: string;
}

/**
 * Informe de instalación: materiales que un técnico instala en un sitio a
 * partir de un remito de depósito en papel. Abierto a cualquier rol (no
 * solo Admin/Supervisor) — es el trabajo de campo normal de un técnico, no
 * una decisión operativa como Bajas/Entregas a Depósito manuales. Lo que
 * sobra del remito (`cantidadSobrante` > 0 en alguna línea) genera
 * automáticamente una devolución en `entregas_deposito` — esa tabla sí es
 * admin/supervisor-only por RLS, así que ese paso puntual usa
 * service-role (la decisión de permitirlo para cualquier técnico está acá,
 * en código, antes de tocar la base — mismo criterio que Bajas/"traer de
 * depósito" en Equipos Individuales, no se afloja la policy en sí).
 */
export async function crearInstalacionAction(formData: FormData): Promise<CrearInstalacionResult> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { success: false, error: "Faltan datos de la instalación." };
  }
  let payload: CrearInstalacionPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Faltan datos de la instalación." };
  }
  const remitoFoto = formData.get("remitoFoto");

  const profile = await requireProfile();
  if (payload.materiales.length === 0) {
    return { success: false, error: "Agregá al menos un material instalado." };
  }
  if (payload.materiales.some((m) => !m.descripcion.trim())) {
    return { success: false, error: "Completá la descripción de todos los materiales instalados." };
  }
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  const supabase = await createClient();

  const ubicacionResuelta = await resolverUbicacionId(
    supabase,
    { ubicacionId: payload.ubicacionId, ubicacionNueva: payload.ubicacionNueva },
    profile.id,
    "la instalación",
  );
  if ("error" in ubicacionResuelta) return { success: false, error: ubicacionResuelta.error };
  await tagGpsSiFalta(supabase, ubicacionResuelta.id, payload.gps, profile.id);

  const { data: ubicacion } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", ubicacionResuelta.id)
    .single();
  if (!ubicacion) return { success: false, error: "No se encontró la ubicación elegida." };

  // N° de generación único (INS-{año}-{4 dígitos}), verificado con SELECT —
  // mismo criterio que Entregas a Depósito: todas las filas del lote lo
  // comparten, así que no hay constraint UNIQUE de por medio.
  let numeroGeneracion = nuevoNumeroGeneracionInstalacion();
  for (let intento = 0; intento < 5; intento++) {
    const { data: existente } = await supabase
      .from("instalaciones")
      .select("id")
      .eq("numero_generacion", numeroGeneracion)
      .limit(1)
      .maybeSingle();
    if (!existente) break;
    numeroGeneracion = nuevoNumeroGeneracionInstalacion();
  }

  // Foto del remito (opcional): se sube una sola vez y el path queda
  // compartido en todas las filas del lote, igual criterio que las fotos de
  // evidencia de Entregas a Depósito.
  let remitoFotoBuffer: Buffer | null = null;
  let remitoFotoPath: string | null = null;
  if (remitoFoto instanceof File) {
    remitoFotoBuffer = Buffer.from(await remitoFoto.arrayBuffer());
    const path = `${profile.id}/instalacion/${numeroGeneracion}/remito.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(path, remitoFotoBuffer, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) remitoFotoPath = path;
  }

  // Sobrantes del remito → devolución automática a depósito. entregas_deposito
  // es admin/supervisor-only por RLS, así que acá sí hace falta service-role.
  const sobrantes = payload.remitoItems.filter((r) => r.cantidadSobrante > 0);
  let entregaDepositoNumeroGeneracion: string | null = null;
  if (sobrantes.length > 0) {
    let service: ReturnType<typeof createServiceRoleClient>;
    try {
      service = createServiceRoleClient();
    } catch {
      return {
        success: false,
        error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor — sin esa variable no se puede generar la devolución de sobrantes.",
      };
    }
    const materialesSobrantes: MaterialLoteDeposito[] = sobrantes.map((r) => ({
      descripcion: r.descripcion,
      categoria: "",
      marcaModelo: "",
      numeroSerie: "",
      etiquetaYpf: "",
      cantidad: r.cantidadSobrante,
      condicion: "nuevo",
      motivo: "sobrante_obra",
      comentario: `Sobrante de instalación ${numeroGeneracion}${payload.remitoNumero ? ` (remito ${payload.remitoNumero})` : ""}.`,
    }));
    const resultadoDevolucion = await crearEntregaDepositoLote({
      supabase: service,
      ubicacionId: ubicacionResuelta.id,
      ubicacion,
      fecha: payload.fecha,
      materiales: materialesSobrantes,
      createdBy: profile.id,
      realizoNombre: profile.nombreCompleto,
      fotosEvidencia: [],
    });
    if (!resultadoDevolucion.success) {
      return { success: false, error: `No se pudo generar la devolución de sobrantes: ${resultadoDevolucion.error ?? "error desconocido"}` };
    }
    entregaDepositoNumeroGeneracion = resultadoDevolucion.numeroGeneracion ?? null;
  }

  const { data: filasInsertadas, error: insertError } = await supabase
    .from("instalaciones")
    .insert(
      payload.materiales.map((m) => ({
        numero_generacion: numeroGeneracion,
        ubicacion_id: ubicacionResuelta.id,
        fecha: payload.fecha,
        descripcion: m.descripcion.trim(),
        categoria: m.categoria.trim() || null,
        marca_modelo: m.marcaModelo.trim() || null,
        numero_serie: m.numeroSerie.trim() || null,
        etiqueta_ypf: m.etiquetaYpf.trim() || null,
        cantidad: m.cantidad || 1,
        comentario: m.comentario.trim() || null,
        remito_foto_url: remitoFotoPath,
        remito_numero: payload.remitoNumero,
        entrega_deposito_numero_generacion: entregaDepositoNumeroGeneracion,
        created_by: profile.id,
      })),
    )
    .select("id");
  if (insertError || !filasInsertadas || filasInsertadas.length === 0) {
    return { success: false, error: `No se pudo registrar la instalación: ${insertError?.message ?? "error desconocido"}` };
  }
  const idsInsertados = filasInsertadas.map((f) => f.id);

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

  const pdfBuffer = await renderInstalacionPdf({
    numeroGeneracion,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha: payload.fecha,
    items: payload.materiales.map((m) => ({
      descripcion: m.descripcion.trim(),
      categoria: m.categoria.trim() || null,
      marcaModelo: m.marcaModelo.trim() || null,
      numeroSerie: m.numeroSerie.trim() || null,
      etiquetaYpf: m.etiquetaYpf.trim() || null,
      cantidad: m.cantidad || 1,
      comentario: m.comentario.trim() || null,
    })),
    remitoNumero: payload.remitoNumero,
    remitoItems: payload.remitoItems,
    remitoFotoBuffer,
    entregaDepositoNumeroGeneracion,
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const detalleArchivo = payload.materiales.length === 1 ? payload.materiales[0].descripcion : `${payload.materiales.length}-materiales`;
  const pdfFilename = buildInstalacionFilename({ numeroGeneracion, descripcion: detalleArchivo, sitio: ubicacion.sitio });
  const pdfPath = `${profile.id}/instalacion/${numeroGeneracion}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await supabase
      .from("instalaciones")
      .update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() })
      .in("id", idsInsertados);
  }

  revalidatePath("/instalacion/historial");
  return { success: true, numeroGeneracion, entregaDepositoNumeroGeneracion: entregaDepositoNumeroGeneracion ?? undefined };
}
