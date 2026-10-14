"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ConfigActionResult } from "./empresa";
import type { EstadoChecklist } from "@/lib/database.types";

interface VehiculoPayload {
  patente: string;
  marcaModelo: string;
  vencimientoTarjetaVerde: string;
  vencimientoRto: string;
  kilometrajeActual: string;
}

function revalidateAll() {
  revalidatePath("/panel/vehiculos");
  revalidatePath("/informe-tecnico/nuevo");
}

export async function addVehiculoAction(formData: FormData): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  const payload: VehiculoPayload = JSON.parse(raw);

  const patente = payload.patente.trim();
  if (!patente) return { success: false, error: "Falta la patente." };

  const supabase = await createClient();
  const { data: vehiculo, error } = await supabase
    .from("catalogo_vehiculos")
    .insert({
      patente,
      marca_modelo: payload.marcaModelo.trim() || null,
      vencimiento_tarjeta_verde: payload.vencimientoTarjetaVerde || null,
      vencimiento_rto: payload.vencimientoRto || null,
      kilometraje_actual: payload.kilometrajeActual ? Number(payload.kilometrajeActual) : null,
    })
    .select("id")
    .single();

  if (error || !vehiculo) {
    return { success: false, error: error?.code === "23505" ? "Ya existe un vehículo con esa patente." : error?.message };
  }

  const tarjetaFoto = formData.get("tarjetaFoto");
  if (tarjetaFoto instanceof File && tarjetaFoto.size > 0) {
    const buffer = Buffer.from(await tarjetaFoto.arrayBuffer());
    const path = `${vehiculo.id}/tarjeta-verde.jpg`;
    const { error: upErr } = await supabase.storage.from("vehiculo-docs").upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (!upErr) await supabase.from("catalogo_vehiculos").update({ foto_tarjeta_verde_url: path }).eq("id", vehiculo.id);
  }
  const rtoFoto = formData.get("rtoFoto");
  if (rtoFoto instanceof File && rtoFoto.size > 0) {
    const buffer = Buffer.from(await rtoFoto.arrayBuffer());
    const path = `${vehiculo.id}/rto.jpg`;
    const { error: upErr } = await supabase.storage.from("vehiculo-docs").upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (!upErr) await supabase.from("catalogo_vehiculos").update({ foto_rto_url: path }).eq("id", vehiculo.id);
  }

  await logAudit(supabase, profile, `Agregó el vehículo "${patente}" al catálogo`);
  revalidateAll();
  return { success: true };
}

export async function removeVehiculoAction(id: string, patente: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("catalogo_vehiculos").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  await supabase.storage.from("vehiculo-docs").remove([`${id}/tarjeta-verde.jpg`, `${id}/rto.jpg`]);
  await logAudit(supabase, profile, `Quitó el vehículo "${patente}" del catálogo`);
  revalidateAll();
  return { success: true };
}

export async function actualizarKilometrajeAction(
  vehiculoId: string,
  patente: string,
  kilometraje: string,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const km = Number(kilometraje);
  if (!Number.isFinite(km) || km < 0) return { success: false, error: "Kilometraje inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("catalogo_vehiculos")
    .update({ kilometraje_actual: km, updated_at: new Date().toISOString() })
    .eq("id", vehiculoId);
  if (error) return { success: false, error: error.message };
  await logAudit(supabase, profile, `Actualizó el kilometraje de "${patente}" a ${km.toLocaleString("es-AR")} km`);
  revalidateAll();
  return { success: true };
}

interface ServicePayload {
  vehiculoId: string;
  fecha: string;
  kilometraje: string;
  descripcion: string;
}

export async function addServiceAction(formData: FormData): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  const payload: ServicePayload = JSON.parse(raw);

  const km = Number(payload.kilometraje);
  if (!payload.vehiculoId || !payload.fecha || !Number.isFinite(km)) {
    return { success: false, error: "Faltan datos del service (vehículo, fecha, kilometraje)." };
  }

  const supabase = await createClient();
  const { data: service, error } = await supabase
    .from("vehiculo_services")
    .insert({
      vehiculo_id: payload.vehiculoId,
      fecha: payload.fecha,
      kilometraje: km,
      descripcion: payload.descripcion.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !service) return { success: false, error: error?.message || "No se pudo registrar el service." };

  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const buffer = Buffer.from(await foto.arrayBuffer());
    const path = `${payload.vehiculoId}/services/${service.id}.jpg`;
    const { error: upErr } = await supabase.storage.from("vehiculo-docs").upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (!upErr) await supabase.from("vehiculo_services").update({ foto_url: path }).eq("id", service.id);
  }

  const { data: vehiculo } = await supabase.from("catalogo_vehiculos").select("patente").eq("id", payload.vehiculoId).single();
  await logAudit(supabase, profile, `Registró un service para "${vehiculo?.patente ?? payload.vehiculoId}" (${km.toLocaleString("es-AR")} km)`);
  revalidateAll();
  return { success: true };
}

interface AltaVehiculoPayload {
  patente: string;
  marcaModelo: string;
  kilometrajeActual: string;
  estadoGeneral: string;
  tieneDanios: boolean | null;
  hallazgos?: { itemId: string; estado: EstadoChecklist; comentario: string }[];
}

export interface AltaVehiculoResult extends ConfigActionResult {
  vehiculoId?: string;
}

/**
 * Alta de vehículo con fotos (IA): mismo flujo de siempre (la IA lee,
 * el Admin revisa/corrige, los campos finales son los que llegan en el
 * payload, nunca lo que devolvió la IA sin pasar por acá) — guarda TODAS
 * las fotos de cada lote (exterior/interior) como galería del estado del
 * vehículo al momento del alta, no solo una representativa.
 */
export async function altaVehiculoConFotosAction(formData: FormData): Promise<AltaVehiculoResult> {
  const profile = await requireAdmin();
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  const payload: AltaVehiculoPayload = JSON.parse(raw);

  const patente = payload.patente.trim().toUpperCase();
  if (!patente) return { success: false, error: "Falta la patente." };

  const supabase = await createClient();
  const { data: vehiculo, error } = await supabase
    .from("catalogo_vehiculos")
    .insert({
      patente,
      marca_modelo: payload.marcaModelo.trim() || null,
      kilometraje_actual: payload.kilometrajeActual ? Number(payload.kilometrajeActual) : null,
      estado_alta: payload.estadoGeneral.trim() || null,
      tiene_danios_alta: payload.tieneDanios,
    })
    .select("id")
    .single();

  if (error || !vehiculo) {
    return { success: false, error: error?.code === "23505" ? "Ya existe un vehículo con esa patente." : error?.message };
  }

  async function subirGaleria(campo: string, carpeta: "exterior" | "interior"): Promise<string[]> {
    const fotos = formData.getAll(campo).filter((f): f is File => f instanceof File && f.size > 0);
    const paths: string[] = [];
    for (let i = 0; i < fotos.length; i++) {
      const buffer = Buffer.from(await fotos[i].arrayBuffer());
      const path = `${vehiculo!.id}/${carpeta}-${i + 1}.jpg`;
      const { error: upErr } = await supabase.storage.from("vehiculo-docs").upload(path, buffer, { contentType: "image/jpeg", upsert: true });
      if (!upErr) paths.push(path);
    }
    return paths;
  }

  const fotosExteriorUrls = await subirGaleria("fotosExterior", "exterior");
  const fotosInteriorUrls = await subirGaleria("fotosInterior", "interior");
  if (fotosExteriorUrls.length > 0 || fotosInteriorUrls.length > 0) {
    await supabase
      .from("catalogo_vehiculos")
      .update({
        ...(fotosExteriorUrls.length > 0 ? { fotos_exterior_urls: fotosExteriorUrls } : {}),
        ...(fotosInteriorUrls.length > 0 ? { fotos_interior_urls: fotosInteriorUrls } : {}),
      })
      .eq("id", vehiculo.id);
  }

  // Inspección IA (opcional): solo los ítems que el Admin confirmó/corrigió
  // (estado no nulo) — ver catalogo_inspeccion_ia (modulo="vehiculos").
  if (payload.hallazgos && payload.hallazgos.length > 0) {
    await supabase.from("inspeccion_ia_hallazgos").insert(
      payload.hallazgos.map((h) => ({
        modulo: "vehiculos" as const,
        registro_id: vehiculo.id,
        item_id: h.itemId,
        estado: h.estado,
        comentario: h.comentario.trim() || null,
      })),
    );
  }

  await logAudit(supabase, profile, `Dio de alta el vehículo "${patente}" con fotos (IA)`);
  revalidateAll();
  return { success: true, vehiculoId: vehiculo.id };
}
