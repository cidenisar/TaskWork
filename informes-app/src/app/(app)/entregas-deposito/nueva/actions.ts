"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { puedeGestionarDeposito } from "@/lib/types";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { nuevoNumeroGeneracionEntrega } from "@/lib/deposito/numero-generacion";
import { renderEntregaDepositoPdf } from "@/lib/pdf/render";
import { buildEntregaDepositoFilename } from "@/lib/pdf/filename";
import type { CondicionMaterial, MotivoEntregaDeposito } from "@/lib/database.types";

interface PayloadMaterial {
  descripcion: string;
  categoria: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  condicion: CondicionMaterial;
  motivo: MotivoEntregaDeposito;
  comentario: string;
}

export interface EntregarLoteADepositoPayload {
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  fecha: string;
  materiales: PayloadMaterial[];
}

export interface EntregarLoteADepositoResult {
  success: boolean;
  error?: string;
  numeroGeneracion?: string;
}

/**
 * Entrega a depósito de material/equipo que NUNCA se registró como
 * equipamiento de un sitio (cables sueltos, repuestos, equipo nuevo sin
 * instalar) — no hay fila de tablero/rack/equipo que tocar, así que no
 * hace falta Service Role: la policy de INSERT/UPDATE de
 * `entregas_deposito` ya exige Admin/Supervisor, igual que el gate de la
 * UI.
 *
 * Una misma carga puede traer VARIOS materiales distintos de la misma
 * visita (ej. sacando fotos de todos juntos) — cada material queda como
 * su propia fila en `entregas_deposito`, pero todas comparten un solo
 * N° de generación y un solo PDF (una tabla con todos los materiales),
 * igual criterio que el relevamiento de Equipos Individuales. Por eso el
 * número se verifica con un SELECT antes de insertar (reintento ante
 * colisión) en vez de depender de una constraint UNIQUE: varias filas
 * necesitan compartir el mismo valor a propósito.
 */
export async function entregarLoteADepositoAction(payload: EntregarLoteADepositoPayload): Promise<EntregarLoteADepositoResult> {
  const profile = await requireProfile();
  if (!puedeGestionarDeposito(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede entregar material a depósito." };
  }
  if (payload.materiales.length === 0) return { success: false, error: "Agregá al menos un material." };
  if (payload.materiales.some((m) => !m.descripcion.trim())) {
    return { success: false, error: "Completá la descripción de todos los materiales cargados." };
  }
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  const supabase = await createClient();

  const ubicacionResuelta = await resolverUbicacionId(
    supabase,
    { ubicacionId: payload.ubicacionId, ubicacionNueva: payload.ubicacionNueva },
    profile.id,
    "la entrega a depósito",
  );
  if ("error" in ubicacionResuelta) return { success: false, error: ubicacionResuelta.error };
  await tagGpsSiFalta(supabase, ubicacionResuelta.id, payload.gps, profile.id);

  const { data: ubicacion } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", ubicacionResuelta.id)
    .single();
  if (!ubicacion) return { success: false, error: "No se encontró la ubicación elegida." };

  // N° de generación único (DEP-{año}-{4 dígitos}), verificado con SELECT
  // porque esta vez TODAS las filas del lote lo van a compartir — no se
  // puede usar el truco de "insertar y reintentar ante 23505" como en el
  // resto de la app, al no haber más una constraint UNIQUE de por medio.
  let numeroGeneracion = nuevoNumeroGeneracionEntrega();
  for (let intento = 0; intento < 5; intento++) {
    const { data: existente } = await supabase
      .from("entregas_deposito")
      .select("id")
      .eq("numero_generacion", numeroGeneracion)
      .limit(1)
      .maybeSingle();
    if (!existente) break;
    numeroGeneracion = nuevoNumeroGeneracionEntrega();
  }

  const { data: filasInsertadas, error: insertError } = await supabase
    .from("entregas_deposito")
    .insert(
      payload.materiales.map((m) => ({
        numero_generacion: numeroGeneracion,
        origen: "material_libre" as const,
        descripcion: m.descripcion.trim(),
        categoria: m.categoria.trim() || null,
        marca_modelo: m.marcaModelo.trim() || null,
        numero_serie: m.numeroSerie.trim() || null,
        etiqueta_ypf: m.etiquetaYpf.trim() || null,
        cantidad: m.cantidad || 1,
        condicion: m.condicion,
        motivo: m.motivo,
        comentario: m.comentario.trim() || null,
        ubicacion_id: ubicacionResuelta.id,
        fecha: payload.fecha,
        created_by: profile.id,
      })),
    )
    .select("id");
  if (insertError || !filasInsertadas || filasInsertadas.length === 0) {
    return { success: false, error: `No se pudo registrar la entrega: ${insertError?.message ?? "error desconocido"}` };
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

  const pdfBuffer = await renderEntregaDepositoPdf({
    numeroGeneracion,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha: payload.fecha,
    items: payload.materiales.map((m) => ({
      tipoEquipoLabel: null,
      descripcion: m.descripcion.trim(),
      categoria: m.categoria.trim() || null,
      marcaModelo: m.marcaModelo.trim() || null,
      numeroSerie: m.numeroSerie.trim() || null,
      etiquetaYpf: m.etiquetaYpf.trim() || null,
      cantidad: m.cantidad || 1,
      condicion: m.condicion,
      motivo: m.motivo,
      comentario: m.comentario.trim() || null,
    })),
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const detalleArchivo =
    payload.materiales.length === 1 ? payload.materiales[0].descripcion : `${payload.materiales.length}-materiales`;
  const pdfFilename = buildEntregaDepositoFilename({ numeroGeneracion, descripcion: detalleArchivo, sitio: ubicacion.sitio });
  const pdfPath = `${profile.id}/entregas-deposito/${numeroGeneracion}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await supabase
      .from("entregas_deposito")
      .update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() })
      .in("id", idsInsertados);
  }

  revalidatePath("/entregas-deposito/historial");
  return { success: true, numeroGeneracion };
}
