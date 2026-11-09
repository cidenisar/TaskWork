"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { horaGuardiaIso } from "@/lib/guardia/reloj";
import { inicioSemana, regenerarDesde, celdasCambiadas, type AreaGuardia } from "@/lib/guardia/cronograma";
import { cargarCronograma, cargarPersonas, cargarParametros } from "@/lib/guardia/datos";
import type { AreaGuardiaDb } from "@/lib/database.types";

export interface AccionResult {
  success: boolean;
  error?: string;
}

/**
 * Asignar a alguien a una guardia (o quitársela, `area: null` = "Sin
 * guardia") — HANDOFF §7.4. Reescribe el cronograma desde la SEMANA QUE
 * VIENE para el área que la persona deja y la que entra (nunca el pasado
 * ni la semana en curso, salvo que esa persona ya no esté en la lista de
 * esa área — eso lo decide `regenerarDesde`, no este action).
 */
export async function asignarPersonaDeGuardiaAction(
  usuarioId: string,
  nombreCompleto: string,
  areaNueva: AreaGuardia | null,
  orden: number,
): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();

  const { data: actual } = await supabase.from("guardia_persona").select("area, orden").eq("usuario_id", usuarioId).maybeSingle();
  const areaAnterior = (actual?.area as AreaGuardia | undefined) ?? null;
  if (areaAnterior === areaNueva && actual?.orden === orden) return { success: true };

  if (areaNueva === null) {
    const { error } = await supabase.from("guardia_persona").delete().eq("usuario_id", usuarioId);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("guardia_persona")
      .upsert({ usuario_id: usuarioId, area: areaNueva satisfies AreaGuardiaDb, orden });
    if (error) return { success: false, error: error.message };
  }

  await supabase.from("guardia_persona_hist").insert({
    usuario_id: usuarioId,
    area_antes: areaAnterior,
    area_despues: areaNueva,
    quien: profile.id,
  });

  const areasAfectadas = [...new Set([areaAnterior, areaNueva].filter((a): a is AreaGuardia => a !== null))];
  if (areasAfectadas.length > 0) {
    const [cronogramaAntes, personas, parametros] = await Promise.all([cargarCronograma(supabase), cargarPersonas(supabase), cargarParametros(supabase)]);
    const semanaActual = inicioSemana(horaGuardiaIso(), parametros.cambioMin);
    let cronogramaNuevo = cronogramaAntes;
    for (const area of areasAfectadas) {
      cronogramaNuevo = regenerarDesde(cronogramaNuevo, personas, area, semanaActual);
    }
    for (const area of areasAfectadas) {
      const cambios = celdasCambiadas(cronogramaAntes, cronogramaNuevo, area);
      for (const c of cambios) {
        await supabase.from("guardia_cronograma_semana").upsert({ semana_inicio: c.semanaInicio, area, usuario_id: c.despues });
        await supabase.from("guardia_cronograma_hist").insert({
          semana_inicio: c.semanaInicio,
          area,
          antes: c.antes,
          despues: c.despues,
          motivo: `Rehecho por cambio de guardia de ${nombreCompleto}`,
          quien: profile.id,
        });
      }
    }
  }

  revalidatePath("/panel/guardia/personas");
  revalidatePath("/panel/guardia/cronograma");
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}
