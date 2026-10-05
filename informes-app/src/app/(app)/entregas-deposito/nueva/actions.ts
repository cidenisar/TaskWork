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

export interface EntregarMaterialLibrePayload {
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
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

export interface EntregarMaterialLibreResult {
  success: boolean;
  error?: string;
  entregaId?: string;
  numeroGeneracion?: string;
}

/**
 * Entrega a depósito de material/equipo que NUNCA se registró como
 * equipamiento de un sitio (cables sueltos, repuestos, equipo nuevo sin
 * instalar) — no hay fila de tablero/rack/equipo que tocar, así que no
 * hace falta Service Role: la policy de INSERT de `entregas_deposito` ya
 * exige Admin/Supervisor, igual que el gate de la UI.
 */
export async function entregarMaterialLibreAction(payload: EntregarMaterialLibrePayload): Promise<EntregarMaterialLibreResult> {
  const profile = await requireProfile();
  if (!puedeGestionarDeposito(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede entregar material a depósito." };
  }
  if (!payload.descripcion.trim()) return { success: false, error: "Falta describir el material/equipo entregado." };
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

  let numeroGeneracion = nuevoNumeroGeneracionEntrega();
  let entregaId: string | null = null;
  for (let attempt = 0; attempt < 5 && !entregaId; attempt++) {
    const { data, error } = await supabase
      .from("entregas_deposito")
      .insert({
        numero_generacion: numeroGeneracion,
        origen: "material_libre",
        descripcion: payload.descripcion.trim(),
        categoria: payload.categoria.trim() || null,
        marca_modelo: payload.marcaModelo.trim() || null,
        numero_serie: payload.numeroSerie.trim() || null,
        etiqueta_ypf: payload.etiquetaYpf.trim() || null,
        cantidad: payload.cantidad || 1,
        condicion: payload.condicion,
        motivo: payload.motivo,
        comentario: payload.comentario.trim() || null,
        ubicacion_id: ubicacionResuelta.id,
        fecha: payload.fecha,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionEntrega();
        continue;
      }
      return { success: false, error: `No se pudo registrar la entrega: ${error.message}` };
    }
    entregaId = data!.id;
  }
  if (!entregaId) return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };

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
    tipoEquipoLabel: null,
    descripcion: payload.descripcion.trim(),
    categoria: payload.categoria.trim() || null,
    marcaModelo: payload.marcaModelo.trim() || null,
    numeroSerie: payload.numeroSerie.trim() || null,
    etiquetaYpf: payload.etiquetaYpf.trim() || null,
    cantidad: payload.cantidad || 1,
    condicion: payload.condicion,
    motivo: payload.motivo,
    comentario: payload.comentario.trim() || null,
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildEntregaDepositoFilename({ numeroGeneracion, descripcion: payload.descripcion, sitio: ubicacion.sitio });
  const pdfPath = `${profile.id}/entregas-deposito/${entregaId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await supabase.from("entregas_deposito").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", entregaId);
  }

  revalidatePath("/entregas-deposito/historial");
  return { success: true, entregaId, numeroGeneracion };
}
