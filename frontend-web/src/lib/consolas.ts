import { supabase } from "./supabase";

export interface ConsolaEstado {
  id: string;
  nombre: string;
  enLinea: boolean;
  ultimoHeartbeat: string | null;
}

/**
 * Solo `nombre`/`en_linea`/`ultimo_heartbeat` — batería, camino de red y
 * firmware (que sí muestra el wireframe) no se sincronizan a Supabase
 * hoy, viven solo en la Pi/ESP32. Ver ROADMAP.md.
 */
export async function listarConsolas(sitioId: string): Promise<ConsolaEstado[]> {
  const { data, error } = await supabase.from("consolas").select("id, nombre, en_linea, ultimo_heartbeat").eq("sitio_id", sitioId).order("nombre");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id as string,
    nombre: c.nombre as string,
    enLinea: c.en_linea as boolean,
    ultimoHeartbeat: c.ultimo_heartbeat as string | null,
  }));
}

// ---------- Administración de consolas (ver routes/Consolas.tsx) ----------
//
// Mismo criterio que Puntos de Encuentro/Operadores: escritura directa
// contra Supabase, `org_isolation` (vía sitios.organizacion_id) ya se lo
// permite a un admin. `en_linea`/`ultimo_heartbeat` son de solo lectura
// acá también — los escribe backend-server desde el heartbeat MQTT real
// (ver backend-server/README.md), esta pantalla nunca los toca.
//
// `prog_config`: alta/edición de la asignación de PROG1-4 a un tipo de
// evento (ver backend-server/README.md, "Sincronización de PROG1-4").
// Escribirlo acá NO publica nada por MQTT al toque — llega a la consola
// física por el mismo barrido periódico (cada 5 min, o al reiniciar
// backend-server) que ya sincroniza el padrón; no hay push puntual
// todavía (confirmado: tampoco lo tiene el padrón, incluso con Frontend
// Web ya construido) — demora esperada, no un bug.

export type EstadoConsolaConfig = "activa" | "de_baja";

export interface ProgConfig {
  prog1: string | null;
  prog2: string | null;
  prog3: string | null;
  prog4: string | null;
}

export interface ConsolaAdmin {
  id: string;
  nombre: string;
  nota: string | null;
  estadoConfig: EstadoConsolaConfig;
  enLinea: boolean;
  ultimoHeartbeat: string | null;
  progConfig: ProgConfig;
}

function progConfigDesdeJson(raw: unknown): ProgConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    prog1: (c.prog1 as string | null | undefined) ?? null,
    prog2: (c.prog2 as string | null | undefined) ?? null,
    prog3: (c.prog3 as string | null | undefined) ?? null,
    prog4: (c.prog4 as string | null | undefined) ?? null,
  };
}

export async function listarConsolasAdmin(sitioId: string): Promise<ConsolaAdmin[]> {
  const { data, error } = await supabase
    .from("consolas")
    .select("id, nombre, nota, estado_config, en_linea, ultimo_heartbeat, prog_config")
    .eq("sitio_id", sitioId)
    .order("nombre");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id as string,
    nombre: c.nombre as string,
    nota: c.nota as string | null,
    estadoConfig: c.estado_config as EstadoConsolaConfig,
    enLinea: c.en_linea as boolean,
    ultimoHeartbeat: c.ultimo_heartbeat as string | null,
    progConfig: progConfigDesdeJson(c.prog_config),
  }));
}

export async function crearConsola(sitioId: string, nombre: string, nota: string, progConfig: ProgConfig): Promise<void> {
  const { error } = await supabase.from("consolas").insert({ sitio_id: sitioId, nombre, nota: nota || null, prog_config: progConfig });
  if (error) throw error;
}

export async function actualizarConsola(id: string, nombre: string, nota: string, progConfig: ProgConfig): Promise<void> {
  const { error } = await supabase
    .from("consolas")
    .update({ nombre, nota: nota || null, prog_config: progConfig, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function cambiarEstadoConsola(id: string, estadoConfig: EstadoConsolaConfig): Promise<void> {
  const { error } = await supabase.from("consolas").update({ estado_config: estadoConfig, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
