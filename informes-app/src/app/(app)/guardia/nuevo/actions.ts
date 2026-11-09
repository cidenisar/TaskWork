"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { TipoAlarmaGuardia, TicketTipoGuardia } from "@/lib/database.types";

export interface CrearEventoResult {
  success: boolean;
  eventoId?: string;
  numero?: number;
  error?: string;
}

interface CrearEventoPayload {
  tipoAlarma: TipoAlarmaGuardia;
  sitio: string;
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
  await requireProfile();
  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  const payload: CrearEventoPayload = JSON.parse(raw);

  if (!payload.sitio.trim() || !payload.descripcion.trim()) {
    return { success: false, error: "Faltan datos de la llamada (sitio, qué comentó operación central)." };
  }

  const supabase = await createClient();
  const { data: evento, error } = await supabase.rpc("guardia_crear_evento", {
    p_tipo_alarma: payload.tipoAlarma,
    p_sitio: payload.sitio.trim(),
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

  revalidatePath("/guardia/historial");
  revalidatePath("/panel/guardia");
  return { success: true, eventoId: evento.id, numero: evento.numero };
}
