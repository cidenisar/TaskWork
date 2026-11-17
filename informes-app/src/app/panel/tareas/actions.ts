"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { resolverEquipo } from "@/lib/equipamiento/resolver-equipo";
import { buscarEquipoReemplazoAction } from "@/app/(app)/informe-tecnico/nuevo/materiales-picker-actions";
import type { MotivoCierreTarea, TipoEquipoBaja } from "@/lib/database.types";

export interface TareaActionResult {
  success: boolean;
  error?: string;
}

const TIPOS_EQUIPO: TipoEquipoBaja[] = ["tablero_circuito", "rack_equipamiento", "equipo_individual"];
const MOTIVOS_BAJA: MotivoCierreTarea[] = ["equipo_dado_de_baja", "ya_no_aplica", "duplicada"];

const resumen = (texto: string) => (texto.length > 120 ? `${texto.slice(0, 117)}...` : texto);

/**
 * Cierra una tarea abierta: "resolver" (se hizo) o "baja" (ya no corresponde:
 * se dio de baja el equipo, ya no aplica, estaba repetida). Solo la oficina
 * (también lo exige la RLS). Queda quién, cuándo, el motivo y un comentario.
 */
export async function cerrarTareaAction(id: string, tipo: "resolver" | "baja", motivo: string, comentario: string): Promise<TareaActionResult> {
  const profile = await requireAdminOrSupervisor();

  const esResolver = tipo === "resolver";
  const motivoFinal: MotivoCierreTarea | null = esResolver ? "resuelta_aparte" : (MOTIVOS_BAJA.find((m) => m === motivo) ?? null);
  if (!motivoFinal) return { success: false, error: "Elegí el motivo de la baja." };

  const supabase = await createClient();
  // .eq("estado", "abierta"): si otra persona la cerró en el medio, no se pisa su cierre.
  const { data, error } = await supabase
    .from("tareas_pendientes")
    .update({
      estado: esResolver ? "resuelta" : "descartada",
      motivo_cierre: motivoFinal,
      comentario_cierre: comentario.trim() || null,
      cerrada_at: new Date().toISOString(),
      cerrada_por: profile.id,
    })
    .eq("id", id)
    .eq("estado", "abierta")
    .select("id, texto");
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: "La tarea ya no está abierta (¿la cerró otra persona?)." };

  await logAudit(supabase, profile, `${esResolver ? "Resolvió" : "Dio de baja"} una tarea pendiente: "${resumen(data[0].texto)}"`);
  revalidatePath("/panel/tareas");
  return { success: true };
}

/** Vuelve a abrir una tarea cerrada (por error, o porque el problema volvió). */
export async function reabrirTareaAction(id: string): Promise<TareaActionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tareas_pendientes")
    .update({ estado: "abierta", motivo_cierre: null, comentario_cierre: null, cerrada_at: null, cerrada_por: null, informe_cierre_id: null })
    .eq("id", id)
    .neq("estado", "abierta")
    .select("id, texto");
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: "La tarea ya estaba abierta." };

  await logAudit(supabase, profile, `Reabrió una tarea pendiente: "${resumen(data[0].texto)}"`);
  revalidatePath("/panel/tareas");
  return { success: true };
}

export interface EquipoParaTarea {
  tipo: TipoEquipoBaja;
  id: string;
  texto: string;
  detalle: string;
}

/**
 * Equipos ACTIVOS del sitio de la tarea que coinciden con lo escrito, para
 * vincularla a uno. Junta lo mismo que el buscador de reemplazos (equipos
 * sueltos y de rack) y suma los circuitos de tablero.
 */
export async function buscarEquiposParaTareaAction(ubicacionId: string, query: string): Promise<EquipoParaTarea[]> {
  await requireAdminOrSupervisor();
  const q = query.trim();
  if (!ubicacionId || q.length < 2) return [];
  const supabase = await createClient();

  const base = await buscarEquipoReemplazoAction(ubicacionId, q);
  const equipos: EquipoParaTarea[] = base.map((e) => ({ tipo: e.tipo, id: e.id, texto: e.texto, detalle: e.detalle }));

  const { data: tableros } = await supabase.from("tableros").select("id, denominacion").eq("ubicacion_id", ubicacionId);
  const idsTablero = (tableros ?? []).map((t) => t.id);
  if (idsTablero.length > 0) {
    const likeQ = `%${q.replace(/[%_]/g, "\\$&")}%`;
    const { data: circuitos } = await supabase
      .from("tablero_circuitos")
      .select("id, texto, numero, tablero_id")
      .in("tablero_id", idsTablero)
      .eq("estado", "activo")
      .ilike("texto", likeQ)
      .limit(10);
    const nombreTablero = new Map((tableros ?? []).map((t) => [t.id, t.denominacion]));
    for (const c of circuitos ?? []) {
      equipos.push({
        tipo: "tablero_circuito",
        id: c.id,
        texto: c.texto,
        detalle: `Tablero ${nombreTablero.get(c.tablero_id) ?? "—"} · circuito ${c.numero}`,
      });
    }
  }
  return equipos.slice(0, 20);
}

/**
 * Vincula la tarea a un equipo (o la desvincula con `equipo = null`). Se valida
 * del lado del servidor que el equipo exista, esté activo y sea del MISMO sitio
 * que la tarea: no se confía en lo que mande el navegador.
 */
export async function vincularEquipoAction(tareaId: string, equipo: { tipo: TipoEquipoBaja; id: string } | null): Promise<TareaActionResult> {
  const profile = await requireAdminOrSupervisor();
  const supabase = await createClient();

  const { data: tarea } = await supabase.from("tareas_pendientes").select("id, texto, ubicacion_id, estado").eq("id", tareaId).maybeSingle();
  if (!tarea) return { success: false, error: "No se encontró la tarea." };
  if (tarea.estado !== "abierta") return { success: false, error: "La tarea ya está cerrada." };

  let textoEquipo: string | null = null;
  if (equipo) {
    if (!TIPOS_EQUIPO.includes(equipo.tipo)) return { success: false, error: "Tipo de equipo inválido." };
    const resuelto = await resolverEquipo(createServiceRoleClient(), equipo.tipo, equipo.id);
    if (!resuelto) return { success: false, error: "No se encontró el equipo." };
    if (resuelto.ubicacionId !== tarea.ubicacion_id) return { success: false, error: "El equipo es de otro sitio que la tarea." };
    if (resuelto.estadoActual === "baja") return { success: false, error: "Ese equipo ya está dado de baja." };
    textoEquipo = resuelto.texto;
  }

  const { data, error } = await supabase
    .from("tareas_pendientes")
    .update({ equipo_tipo: equipo?.tipo ?? null, equipo_id: equipo?.id ?? null })
    .eq("id", tareaId)
    .eq("estado", "abierta")
    .select("id");
  if (error) return { success: false, error: error.message };
  if (!data || data.length === 0) return { success: false, error: "No se pudo guardar (¿la cerró otra persona?)." };

  await logAudit(
    supabase,
    profile,
    textoEquipo
      ? `Vinculó la tarea "${resumen(tarea.texto)}" al equipo "${textoEquipo}"`
      : `Desvinculó la tarea "${resumen(tarea.texto)}" de su equipo`,
  );
  revalidatePath("/panel/tareas");
  return { success: true };
}
