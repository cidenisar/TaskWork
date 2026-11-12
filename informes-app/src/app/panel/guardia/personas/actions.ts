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
 * Prender o apagar UNA guardia de un técnico (`activo: false` = "Sin
 * guardia" en esa área) sin tocar sus otras áreas — HANDOFF §7.4, ampliado
 * 12/11 para que un técnico pueda cubrir su sector Y la General a la vez
 * (pedido de Ivan). Reescribe el cronograma de ESA área desde la SEMANA
 * QUE VIENE (nunca el pasado ni la semana en curso, salvo que esa persona
 * ya no esté en la lista de esa área — eso lo decide `regenerarDesde`, no
 * este action).
 */
export async function asignarAreaDeGuardiaAction(
  usuarioId: string,
  nombreCompleto: string,
  area: AreaGuardia,
  activo: boolean,
  orden: number,
): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();

  const { data: actual } = await supabase.from("guardia_persona").select("orden").eq("usuario_id", usuarioId).eq("area", area).maybeSingle();
  const estabaActivo = actual !== null;
  if (estabaActivo === activo && (!activo || actual?.orden === orden)) return { success: true };

  if (!activo) {
    const { error } = await supabase.from("guardia_persona").delete().eq("usuario_id", usuarioId).eq("area", area);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase.from("guardia_persona").upsert({ usuario_id: usuarioId, area: area satisfies AreaGuardiaDb, orden });
    if (error) return { success: false, error: error.message };
  }

  await supabase.from("guardia_persona_hist").insert({
    usuario_id: usuarioId,
    area_antes: estabaActivo ? area : null,
    area_despues: activo ? area : null,
    quien: profile.id,
  });

  const [cronogramaAntes, personas, parametros] = await Promise.all([cargarCronograma(supabase), cargarPersonas(supabase), cargarParametros(supabase)]);
  const semanaActual = inicioSemana(horaGuardiaIso(), parametros.cambioMin);
  const cronogramaNuevo = regenerarDesde(cronogramaAntes, personas, area, semanaActual);
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

  revalidatePath("/panel/guardia/personas");
  revalidatePath("/panel/guardia/cronograma");
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}
