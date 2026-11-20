"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export interface ControlVehiculoResult {
  success: boolean;
  controlId?: string;
  error?: string;
}

interface ControlVehiculoPayload {
  vehiculoId: string;
  kilometraje: string;
  vencimientoMatafuego?: string;
  vencimientoBotiquin?: string;
  /** Lo que quedó en pantalla después de "Comparar con IA" (opcional), revisado por el técnico antes de guardar — ver comparar-estado. */
  estadoGeneral?: string;
  tieneDanios?: boolean | null;
  inconsistenciasDetectadas?: string | null;
}

/**
 * Control periódico de vehículo cargado por cualquier técnico desde el celu
 * — mismo concepto que el control admin del Panel (service-tab.tsx) pero
 * sin "service" formal: solo fecha + kilometraje (que de paso actualiza
 * catalogo_vehiculos.kilometraje_actual) y, si corresponde, los vencimientos
 * de matafuego/botiquín. Las fotos se suben aparte en tandas chicas (ver
 * agregarFotosControlVehiculoAction) — mismo motivo que en el alta de
 * vehículo: juntar hasta 14 fotos en este mismo pedido puede superar el
 * límite de tamaño de request de la plataforma.
 */
export async function crearControlVehiculoAction(formData: FormData): Promise<ControlVehiculoResult> {
  const profile = await requireProfile();
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  const payload: ControlVehiculoPayload = JSON.parse(raw);

  const km = Number(payload.kilometraje);
  if (!payload.vehiculoId || !Number.isFinite(km) || km < 0) {
    return { success: false, error: "Faltan datos del control (vehículo, kilometraje)." };
  }

  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: control, error } = await supabase
    .from("vehiculo_services")
    .insert({
      vehiculo_id: payload.vehiculoId,
      fecha: hoy,
      kilometraje: km,
      created_by: profile.id,
      estado_general: payload.estadoGeneral?.trim() || null,
      tiene_danios: payload.tieneDanios ?? null,
      inconsistencias_detectadas: payload.inconsistenciasDetectadas?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !control) return { success: false, error: error?.message || "No se pudo registrar el control." };

  // catalogo_vehiculos es admin-only por RLS (es el catálogo compartido de la
  // flota, no una fila propia del técnico) — se actualiza acá con el cliente
  // de service-role, pero SOLO estos campos puntuales (nunca patente, marca,
  // tarjeta verde/RTO, que siguen siendo exclusivos de Admin vía Gestión).
  const service = createServiceRoleClient();
  if (payload.vencimientoMatafuego && payload.vencimientoBotiquin) {
    await service
      .from("catalogo_vehiculos")
      .update({
        kilometraje_actual: km,
        vencimiento_matafuego: payload.vencimientoMatafuego,
        vencimiento_botiquin: payload.vencimientoBotiquin,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.vehiculoId);
  } else if (payload.vencimientoMatafuego) {
    await service
      .from("catalogo_vehiculos")
      .update({ kilometraje_actual: km, vencimiento_matafuego: payload.vencimientoMatafuego, updated_at: new Date().toISOString() })
      .eq("id", payload.vehiculoId);
  } else if (payload.vencimientoBotiquin) {
    await service
      .from("catalogo_vehiculos")
      .update({ kilometraje_actual: km, vencimiento_botiquin: payload.vencimientoBotiquin, updated_at: new Date().toISOString() })
      .eq("id", payload.vehiculoId);
  } else {
    await service.from("catalogo_vehiculos").update({ kilometraje_actual: km, updated_at: new Date().toISOString() }).eq("id", payload.vehiculoId);
  }

  revalidatePath("/control-vehiculo/historial");
  revalidatePath("/panel/vehiculos");
  return { success: true, controlId: control.id };
}

export interface AgregarFotosControlResult {
  success: boolean;
  error?: string;
}

/**
 * Paso 2: sube un lote chico de fotos (exterior o interior) al control ya
 * creado — ver el comentario de crearControlVehiculoAction para el motivo
 * de por qué va en tandas separadas en vez de ir todo junto.
 */
export async function agregarFotosControlVehiculoAction(formData: FormData): Promise<AgregarFotosControlResult> {
  const profile = await requireProfile();
  const controlId = formData.get("controlId");
  const carpetaRaw = formData.get("carpeta");
  if (typeof controlId !== "string" || !controlId) return { success: false, error: "Falta el control." };
  if (carpetaRaw !== "exterior" && carpetaRaw !== "interior") return { success: false, error: "Lote de fotos inválido." };
  const carpeta = carpetaRaw;

  const fotos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  if (fotos.length === 0) return { success: true };

  const supabase = await createClient();
  const { data: actual } = await supabase.from("vehiculo_services").select("fotos_exterior_urls, fotos_interior_urls").eq("id", controlId).single();
  const yaSubidas: string[] = (carpeta === "exterior" ? actual?.fotos_exterior_urls : actual?.fotos_interior_urls) ?? [];

  const nuevasUrls: string[] = [];
  for (let i = 0; i < fotos.length; i++) {
    const buffer = Buffer.from(await fotos[i].arrayBuffer());
    const path = `${profile.id}/vehiculo-controles/${controlId}/${carpeta}-${yaSubidas.length + nuevasUrls.length + 1}.jpg`;
    const { error: upErr } = await supabase.storage.from("vehiculo-docs").upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (!upErr) nuevasUrls.push(path);
  }
  if (nuevasUrls.length === 0) return { success: false, error: "No se pudo subir ninguna foto de esta tanda." };

  const todasLasUrls = [...yaSubidas, ...nuevasUrls];
  const { error } = await supabase
    .from("vehiculo_services")
    .update(carpeta === "exterior" ? { fotos_exterior_urls: todasLasUrls } : { fotos_interior_urls: todasLasUrls })
    .eq("id", controlId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
