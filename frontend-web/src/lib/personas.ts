// Capa de datos de "Administración de Padrón de Personas" — ver Cowork.
// Listar/alta manual/editar/dar de baja son escritura directa contra
// Supabase (org_isolation ya le permite a un admin leer y escribir
// cualquier persona de su organización, sin distinguir sitio — mismo
// criterio que Operadores/Códigos: es una de las 4 pestañas de la
// misma pantalla, así que se mantiene consistente con esas dos en vez
// de filtrar por alcance como Puntos de encuentro/Accountability).
// Aprobar/rechazar (pestaña "Pendientes") sí pasan por backend-server
// porque aprobar necesita avisar por push (credenciales de Firebase,
// que el navegador nunca tiene).

import { supabase } from "./supabase";
import { llamarBackend } from "./backend";
import type { AltaImport, CambioImport } from "./importarPadron";

export type TipoPersona = "fijo" | "eventual";
export type EstadoPersona = "activo" | "de_baja" | "vencido";

export interface PersonaFila {
  id: string;
  nombre: string;
  dni: string;
  legajo: string | null;
  telefono: string;
  tipo: TipoPersona;
  estado: EstadoPersona;
  empresa: string | null;
  vencimiento: string | null;
  sitioId: string;
  sitioNombre: string;
  tienePush: boolean;
}

function filaDesdePersona(p: Record<string, unknown>): PersonaFila {
  const sitio = p.sitios as unknown as { nombre: string } | { nombre: string }[] | null;
  const sitioNombre = Array.isArray(sitio) ? (sitio[0]?.nombre ?? "—") : (sitio?.nombre ?? "—");
  return {
    id: p.id as string,
    nombre: p.nombre as string,
    dni: p.dni as string,
    legajo: p.legajo as string | null,
    telefono: p.telefono as string,
    tipo: p.tipo as TipoPersona,
    estado: p.estado as EstadoPersona,
    empresa: p.empresa as string | null,
    vencimiento: p.vencimiento as string | null,
    sitioId: p.sitio_id as string,
    sitioNombre,
    tienePush: !!p.push_token,
  };
}

const SELECT_PERSONA = "id, nombre, dni, legajo, telefono, tipo, estado, empresa, vencimiento, push_token, sitio_id, sitios(nombre)";

/** Padrón: activo/de_baja/vencido — deja afuera pendiente_aprobacion/rechazado (esos viven en la pestaña Pendientes). */
export async function listarPadron(organizacionId: string): Promise<PersonaFila[]> {
  const { data, error } = await supabase
    .from("personas")
    .select(SELECT_PERSONA)
    .eq("organizacion_id", organizacionId)
    .in("estado", ["activo", "de_baja", "vencido"])
    .order("nombre");
  if (error) throw error;
  return (data ?? []).map(filaDesdePersona);
}

export type ResultadoAlta = { ok: true } | { ok: false; error: string };

/** Solo personal fijo — el eventual/contratista entra por código de acceso (pestaña Códigos), no por acá. */
export async function crearPersonaManual(input: {
  organizacionId: string;
  sitioId: string;
  nombre: string;
  dni: string;
  legajo: string | null;
  telefono: string;
}): Promise<ResultadoAlta> {
  const { error } = await supabase.from("personas").insert({
    organizacion_id: input.organizacionId,
    sitio_id: input.sitioId,
    nombre: input.nombre,
    dni: input.dni,
    legajo: input.legajo,
    telefono: input.telefono,
    tipo: "fijo",
    estado: "activo",
    origen: "alta_manual",
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `Ya existe una persona con el DNI ${input.dni} en el padrón.` };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function actualizarPersonaManual(
  id: string,
  input: { sitioId: string; nombre: string; dni: string; legajo: string | null; telefono: string }
): Promise<ResultadoAlta> {
  const { error } = await supabase
    .from("personas")
    .update({
      sitio_id: input.sitioId,
      nombre: input.nombre,
      dni: input.dni,
      legajo: input.legajo,
      telefono: input.telefono,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: `Ya existe otra persona con el DNI ${input.dni} en el padrón.` };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function cambiarEstadoPersona(id: string, estado: "activo" | "de_baja"): Promise<void> {
  const { error } = await supabase.from("personas").update({ estado, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export interface ResultadoAplicarImport {
  altasOk: number;
  altasError: { nombre: string; dni: string; error: string }[];
  cambiosOk: number;
  cambiosError: { nombre: string; error: string }[];
}

/**
 * Aplica altas y cambios de un import (pestaña "Importar", ver
 * lib/importarPadron.ts) fila por fila, no en una sola transacción —
 * así una fila con un problema puntual (ej. una carrera con otra alta
 * manual que tomó el mismo DNI justo ahora) no tira abajo el resto del
 * import, que puede tener docenas de filas válidas. Las posibles bajas
 * NUNCA se tocan acá — el admin las da de baja una por una, a mano
 * (cambiarEstadoPersona), desde la misma pantalla de resultado.
 */
export async function aplicarImport(organizacionId: string, altas: AltaImport[], cambios: CambioImport[]): Promise<ResultadoAplicarImport> {
  const resultado: ResultadoAplicarImport = { altasOk: 0, altasError: [], cambiosOk: 0, cambiosError: [] };

  for (const alta of altas) {
    const { error } = await supabase.from("personas").insert({
      organizacion_id: organizacionId,
      sitio_id: alta.sitioId,
      nombre: alta.nombre,
      dni: alta.dni,
      legajo: alta.legajo,
      telefono: alta.telefono,
      tipo: "fijo",
      estado: "activo",
      origen: "import",
    });
    if (error) {
      resultado.altasError.push({
        nombre: alta.nombre,
        dni: alta.dni,
        error: error.code === "23505" ? "DNI duplicado (ya se agregó en otro lado justo ahora)." : error.message,
      });
    } else {
      resultado.altasOk++;
    }
  }

  for (const cambio of cambios) {
    const { error } = await supabase
      .from("personas")
      .update({ sitio_id: cambio.sitioId, nombre: cambio.nombre, legajo: cambio.legajo, telefono: cambio.telefono, updated_at: new Date().toISOString() })
      .eq("id", cambio.personaId);
    if (error) {
      resultado.cambiosError.push({ nombre: cambio.nombre, error: error.message });
    } else {
      resultado.cambiosOk++;
    }
  }

  return resultado;
}

export interface PersonaPendiente {
  id: string;
  nombre: string;
  dni: string;
  telefono: string;
  sitioNombre: string;
  creadaEn: string;
}

export async function listarPendientes(organizacionId: string): Promise<PersonaPendiente[]> {
  const { data, error } = await supabase
    .from("personas")
    .select("id, nombre, dni, telefono, created_at, sitios(nombre)")
    .eq("organizacion_id", organizacionId)
    .eq("estado", "pendiente_aprobacion")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((p) => {
    const sitio = p.sitios as unknown as { nombre: string } | { nombre: string }[] | null;
    const sitioNombre = Array.isArray(sitio) ? (sitio[0]?.nombre ?? "—") : (sitio?.nombre ?? "—");
    return {
      id: p.id as string,
      nombre: p.nombre as string,
      dni: p.dni as string,
      telefono: p.telefono as string,
      sitioNombre,
      creadaEn: p.created_at as string,
    };
  });
}

export type ResultadoAprobar = { ok: true; notificado: boolean; errorNotificacion?: string } | { ok: false; error: string };

export async function aprobarPersona(id: string): Promise<ResultadoAprobar> {
  const r = await llamarBackend<{ id: string; estado: string; notificado: boolean; errorNotificacion?: string }>(`/personas/${id}/aprobar`, {
    method: "POST",
  });
  if (r.status !== 200 || "error" in r.body) {
    return { ok: false, error: "error" in r.body ? r.body.error : "Error inesperado aprobando la solicitud." };
  }
  return { ok: true, notificado: r.body.notificado, errorNotificacion: r.body.errorNotificacion };
}

export type ResultadoRechazar = { ok: true } | { ok: false; error: string };

export async function rechazarPersona(id: string): Promise<ResultadoRechazar> {
  const r = await llamarBackend<{ id: string; estado: string }>(`/personas/${id}/rechazar`, { method: "POST" });
  if (r.status !== 200 || "error" in r.body) {
    return { ok: false, error: "error" in r.body ? r.body.error : "Error inesperado rechazando la solicitud." };
  }
  return { ok: true };
}
