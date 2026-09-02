"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionRendicion } from "@/lib/rendicion-gastos/numero-generacion";
import type { RendicionFormState } from "@/components/rendicion-gastos/types";

export interface CrearRendicionResult {
  success: boolean;
  error?: string;
  rendicionId?: string;
}

/**
 * Solo crea el "viaje" (Paso 1: motivo, fecha, viático) en estado 'abierta' —
 * los gastos se van agregando después, de a uno, desde /rendicion-gastos/[id]
 * (ver esa carpeta), hasta que el usuario hace el cierre.
 */
export async function crearRendicionAction(payload: RendicionFormState): Promise<CrearRendicionResult> {
  const profile = await requireProfile();

  const viatico = Number(payload.viaticoRecibido.replace(",", "."));
  if (!payload.motivo?.trim() || !payload.fecha || !Number.isFinite(viatico) || viatico < 0) {
    return { success: false, error: "Faltan campos obligatorios (motivo, fecha, viático recibido)." };
  }

  const supabase = await createClient();
  let numeroGeneracion = nuevoNumeroGeneracionRendicion();
  let rendicionId: string | null = null;
  for (let attempt = 0; attempt < 5 && !rendicionId; attempt++) {
    const { data, error } = await supabase
      .from("rendiciones_gastos")
      .insert({
        numero_generacion: numeroGeneracion,
        motivo: payload.motivo.trim(),
        fecha: payload.fecha,
        proyecto_cliente: payload.proyectoCliente.trim() || null,
        provincia: payload.provincia || null,
        viatico_recibido: viatico,
        moneda: payload.moneda,
        created_by: profile.id,
        estado: "abierta",
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionRendicion();
        continue;
      }
      return { success: false, error: `No se pudo crear la rendición: ${error.message}` };
    }
    rendicionId = data!.id;
  }
  if (!rendicionId) {
    return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };
  }

  revalidatePath("/rendicion-gastos/historial");
  return { success: true, rendicionId };
}
