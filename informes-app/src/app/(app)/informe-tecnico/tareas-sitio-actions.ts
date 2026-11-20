"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { diasDesde } from "@/lib/tareas/puro";

export interface TareaDelSitio {
  id: string;
  texto: string;
  dias: number;
  informeNumero: string | null;
}

/**
 * Pendientes abiertos de un sitio para que el técnico tilde los que resolvió en
 * esta visita. Deja afuera los que nacieron en el informe que se está editando
 * (`informeId`): esos son del propio texto del informe, no de una visita anterior.
 */
export async function buscarTareasPendientesDelSitioAction(ubicacionId: string, informeId?: string): Promise<TareaDelSitio[]> {
  await requireProfile();
  if (!ubicacionId || ubicacionId === "__new") return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("tareas_pendientes")
    .select("id, texto, created_at, informe_id")
    .eq("ubicacion_id", ubicacionId)
    .eq("estado", "abierta")
    .order("created_at", { ascending: true })
    .limit(200);
  const filas = (data ?? []).filter((t) => !informeId || t.informe_id !== informeId);
  if (filas.length === 0) return [];

  const informeIds = [...new Set(filas.map((t) => t.informe_id).filter((x): x is string => !!x))];
  const numeros = new Map<string, string>();
  if (informeIds.length > 0) {
    const { data: infs } = await supabase.from("informes_tecnicos").select("id, numero_generacion").in("id", informeIds);
    for (const i of infs ?? []) numeros.set(i.id, String(i.numero_generacion ?? ""));
  }
  const ahora = new Date();
  return filas.map((t) => ({
    id: t.id,
    texto: t.texto,
    dias: diasDesde(t.created_at, ahora),
    informeNumero: (t.informe_id && numeros.get(t.informe_id)) || null,
  }));
}
