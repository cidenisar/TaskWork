"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { labelUbicacion } from "@/components/ubicaciones/types";
import type { TipoAlarmaGuardia, TicketTipoGuardia } from "@/lib/database.types";

export interface CrearEventoResult {
  success: boolean;
  eventoId?: string;
  numero?: number;
  sitio?: string;
  error?: string;
}

interface CrearEventoPayload {
  tipoAlarma: TipoAlarmaGuardia;
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  descripcion: string;
  ticketTipo: TicketTipoGuardia;
  ticketNumero?: string;
}

/**
 * Registrar la llamada (HANDOFF §5, paso 2) — única puerta de entrada: todo
 * pasa por `guardia_crear_evento()` (ver la migración), que valida que
 * quien llama es guardia general, numera el evento (correlativo sin
 * huecos) y crea la participación propia + la primera novedad, todo en la
 * misma transacción de Postgres.
 */
export async function crearEventoAction(formData: FormData): Promise<CrearEventoResult> {
  const profile = await requireProfile();
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  const payload: CrearEventoPayload = JSON.parse(raw);

  if (!payload.descripcion.trim()) {
    return { success: false, error: "Falta qué comentó operación central." };
  }

  const supabase = await createClient();

  const ubicacionResuelta = await resolverUbicacionId(
    supabase,
    { ubicacionId: payload.ubicacionId, ubicacionNueva: payload.ubicacionNueva },
    profile.id,
    "la llamada",
  );
  if ("error" in ubicacionResuelta) return { success: false, error: ubicacionResuelta.error };

  const { data: ubicacionFila } = await supabase
    .from("ubicaciones")
    .select("sitio, planta, oficina, localidad, provincia")
    .eq("id", ubicacionResuelta.id)
    .single();
  if (!ubicacionFila) return { success: false, error: "No se pudo resolver la ubicación." };
  const sitioTexto = labelUbicacion({
    id: ubicacionResuelta.id,
    pais: "Argentina",
    region: "",
    lat: null,
    lng: null,
    ...ubicacionFila,
  });

  const { data: evento, error } = await supabase.rpc("guardia_crear_evento", {
    p_tipo_alarma: payload.tipoAlarma,
    p_sitio: sitioTexto,
    p_descripcion: payload.descripcion.trim(),
    p_ticket_tipo: payload.ticketTipo,
    p_ticket_numero: payload.ticketNumero?.trim() || null,
  });
  if (error || !evento) {
    return {
      success: false,
      error: error?.message.includes("Solo la guardia general")
        ? "Solo la guardia general puede registrar una llamada."
        : error?.message || "No se pudo registrar el evento.",
    };
  }

  await supabase.from("guardia_evento").update({ ubicacion_id: ubicacionResuelta.id }).eq("id", evento.id);
  await tagGpsSiFalta(supabase, ubicacionResuelta.id, payload.gps, profile.id);

  revalidatePath("/guardia");
  revalidatePath("/guardia/historial");
  revalidatePath("/panel/guardia");
  return { success: true, eventoId: evento.id, numero: evento.numero, sitio: sitioTexto };
}
