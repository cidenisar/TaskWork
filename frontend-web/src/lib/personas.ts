// Capa de datos de "Pendientes de aprobación" — ver Cowork
// "Administración de Padrón de Personas" (pestaña Pendientes) y
// backend-server/README.md ("Aprobar/rechazar un autoregistro"). Listar
// es lectura directa contra Supabase (org_isolation ya le permite a un
// admin leer cualquier persona de su organización); aprobar/rechazar
// pasan por backend-server porque aprobar necesita avisar por push
// (credenciales de Firebase, que el navegador nunca tiene).

import { supabase } from "./supabase";
import { llamarBackend } from "./backend";

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
