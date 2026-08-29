// Resuelve qué sitios ve un admin y si alguno tiene un evento en curso —
// usado por el Selector de Sitio (ver README, "Login y Selector de
// Sitio"). Todo esto es lectura directa contra Supabase vía RLS
// (`org_isolation`), no pasa por backend-server.

import { supabase } from "./supabase";
import type { Operador } from "./auth";

export interface SitioConEstado {
  id: string;
  nombre: string;
  eventoActivo: { id: string; tipoNombre: string } | null;
}

async function idsDeSitiosEnAlcance(operador: Operador): Promise<string[] | "organizacion"> {
  if (operador.alcanceTipo === "organizacion") return "organizacion";
  const { data, error } = await supabase.from("operadores_sitios").select("sitio_id").eq("operador_id", operador.id);
  if (error) throw error;
  return (data ?? []).map((r) => r.sitio_id as string);
}

export async function listarSitiosVisibles(operador: Operador): Promise<SitioConEstado[]> {
  const alcance = await idsDeSitiosEnAlcance(operador);

  let sitiosQuery = supabase.from("sitios").select("id, nombre").order("nombre");
  if (alcance === "organizacion") {
    sitiosQuery = sitiosQuery.eq("organizacion_id", operador.organizacionId);
  } else {
    if (alcance.length === 0) return [];
    sitiosQuery = sitiosQuery.in("id", alcance);
  }
  const { data: sitios, error: sitiosError } = await sitiosQuery;
  if (sitiosError) throw sitiosError;
  if (!sitios || sitios.length === 0) return [];

  const sitioIds = sitios.map((s) => s.id as string);
  // tipos_evento(nombre) — embedding vía la FK eventos.tipo_evento_id, para
  // no hacer una segunda ida y vuelta por el nombre del tipo.
  const { data: eventos, error: eventosError } = await supabase
    .from("eventos")
    .select("id, sitio_id, tipos_evento(nombre)")
    .eq("estado", "en_curso")
    .in("sitio_id", sitioIds);
  if (eventosError) throw eventosError;

  const eventoPorSitio = new Map<string, { id: string; tipoNombre: string }>();
  for (const ev of eventos ?? []) {
    const tipo = ev.tipos_evento as unknown as { nombre: string } | { nombre: string }[] | null;
    const tipoNombre = Array.isArray(tipo) ? (tipo[0]?.nombre ?? "Evento") : (tipo?.nombre ?? "Evento");
    eventoPorSitio.set(ev.sitio_id as string, { id: ev.id as string, tipoNombre });
  }

  return sitios.map((s) => ({
    id: s.id as string,
    nombre: s.nombre as string,
    eventoActivo: eventoPorSitio.get(s.id as string) ?? null,
  }));
}
