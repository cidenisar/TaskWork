"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { generarProgramacion, celdasCambiadas, AREAS_GUARDIA, type AreaGuardia } from "@/lib/guardia/cronograma";
import { cargarCronograma, cargarPersonas } from "@/lib/guardia/datos";

export interface AccionResult {
  success: boolean;
  error?: string;
}

/** Generar la programación anual (HANDOFF §7.3) — por área o "Todas", continúa la rotación desde donde estaba, no pisa lo ya cargado salvo que se pida. */
export async function generarProgramacionAction(area: AreaGuardia | "Todas", anio: number, pisar: boolean): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) return { success: false, error: "Año inválido." };

  const supabase = await createClient();
  const [cronogramaAntes, personas] = await Promise.all([cargarCronograma(supabase), cargarPersonas(supabase)]);
  const { cronograma: cronogramaNuevo, nuevos } = generarProgramacion(cronogramaAntes, personas, anio, area, pisar);
  if (nuevos === 0) return { success: false, error: "No hay nada para generar (¿faltan personas cargadas en esa área?)." };

  const areas = area === "Todas" ? AREAS_GUARDIA : [area];
  const motivo = `Programación generada · ${anio} · ${area} (${nuevos} turnos)`;
  for (const a of areas) {
    const cambios = celdasCambiadas(cronogramaAntes, cronogramaNuevo, a);
    for (const c of cambios) {
      const { error } = await supabase.from("guardia_cronograma_semana").upsert({ semana_inicio: c.semanaInicio, area: a, usuario_id: c.despues });
      if (error) return { success: false, error: error.message };
      await supabase.from("guardia_cronograma_hist").insert({ semana_inicio: c.semanaInicio, area: a, antes: c.antes, despues: c.despues, motivo, quien: profile.id });
    }
  }

  revalidatePath("/panel/guardia/cronograma");
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}

/** Editar a mano una celda del cronograma (HANDOFF §7.3) — un selector por semana y área. */
export async function editarCeldaCronogramaAction(semanaInicio: string, area: AreaGuardia, usuarioIdNuevo: string | null): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();

  const { data: actual } = await supabase.from("guardia_cronograma_semana").select("usuario_id").eq("semana_inicio", semanaInicio).eq("area", area).maybeSingle();
  const anterior = actual?.usuario_id ?? null;
  if (anterior === usuarioIdNuevo) return { success: true };

  const { error } = await supabase.from("guardia_cronograma_semana").upsert({ semana_inicio: semanaInicio, area, usuario_id: usuarioIdNuevo });
  if (error) return { success: false, error: error.message };

  await supabase.from("guardia_cronograma_hist").insert({ semana_inicio: semanaInicio, area, antes: anterior, despues: usuarioIdNuevo, motivo: "Editado a mano", quien: profile.id });

  revalidatePath("/panel/guardia/cronograma");
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}

export interface CrearCambioInput {
  area: AreaGuardia;
  originalId: string; // quien no puede
  personaId: string; // quien cubre
  desde: string;
  hasta: string;
  motivo: string;
  devolucion: { desde: string; hasta: string } | null;
}

/** Cambio de guardia / intercambio (HANDOFF §7.5) — lo carga la oficina, queda `pendiente` hasta que quien tiene que cubrir responda desde su celular (circuito todavía no construido — Fase 4). */
export async function crearCambioGuardiaAction(input: CrearCambioInput): Promise<AccionResult> {
  const profile = await requireAdminOrSupervisor();

  if (!input.desde || !input.hasta || input.hasta < input.desde) return { success: false, error: "«Desde» y «hasta» son obligatorios y «hasta» tiene que ser igual o posterior." };
  if (input.personaId === input.originalId) return { success: false, error: "Quien cubre no puede ser la misma persona que no puede." };
  if (input.devolucion) {
    if (!input.devolucion.desde || !input.devolucion.hasta || input.devolucion.hasta < input.devolucion.desde) {
      return { success: false, error: "La devolución tiene que tener desde y hasta, con hasta igual o posterior a desde." };
    }
    if (input.devolucion.desde <= input.hasta) return { success: false, error: "La devolución tiene que ser posterior al turno que se cubre." };
  }

  const supabase = await createClient();
  const parId = crypto.randomUUID();
  const { error: errCubre } = await supabase.from("guardia_cambio").insert({
    par_id: parId,
    tipo: "CUBRE",
    area: input.area,
    persona_id: input.personaId,
    original_id: input.originalId,
    desde: input.desde,
    hasta: input.hasta,
    motivo: input.motivo.trim() || null,
    registrado_por: profile.id,
  });
  if (errCubre) return { success: false, error: errCubre.message };

  if (input.devolucion) {
    const { error: errDevuelve } = await supabase.from("guardia_cambio").insert({
      par_id: parId,
      tipo: "DEVUELVE",
      area: input.area,
      persona_id: input.originalId,
      original_id: input.personaId,
      desde: input.devolucion.desde,
      hasta: input.devolucion.hasta,
      motivo: input.motivo.trim() || null,
      registrado_por: profile.id,
    });
    if (errDevuelve) return { success: false, error: errDevuelve.message };
  }

  revalidatePath("/panel/guardia/cronograma");
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}

/** Anular un cambio (oficina, HANDOFF §7.5) — no se borra la fila (rompería el historial): se marca `anulado`, que ya deja de contar para `cambioVigente`, y el cronograma vuelve a regir. Anula las dos filas del par (cubre + devuelve, si hay). */
export async function anularCambioGuardiaAction(cambioId: string): Promise<AccionResult> {
  await requireAdminOrSupervisor();
  const supabase = await createClient();

  const { data: cambio } = await supabase.from("guardia_cambio").select("par_id, estado").eq("id", cambioId).single();
  if (!cambio) return { success: false, error: "No se encontró el cambio." };
  if (cambio.estado === "anulado") return { success: true };

  const { error } = await supabase.from("guardia_cambio").update({ estado: "anulado", respondido_at: new Date().toISOString() }).eq("par_id", cambio.par_id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/panel/guardia/cronograma");
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}
