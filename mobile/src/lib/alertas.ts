// "Mis alertas" — lee directo contra Supabase (RLS nueva, ver
// backend-server/README.md, "RLS: Mobile puede leer puntos de
// encuentro, eventos y su propio historial"): las confirmaciones
// propias, el evento/tipo de cada una, y los puntos de encuentro
// habilitados para elegir al confirmar. Confirmar en sí (escribir el
// estado) pasa por backend-server (ver lib/registro.ts, mismo criterio
// — necesita derivar quién confirma del JWT, no de un campo del body).

import { supabase } from "./supabase";
import { llamarBackend } from "./backend";

export type EstadoConfirmacion = "ok" | "ayuda" | "pendiente";

export interface AlertaPropia {
  confirmacionId: string;
  eventoId: string;
  estadoConfirmacion: EstadoConfirmacion;
  puntoId: string | null;
  tipoNombre: string;
  eventoEstado: "en_curso" | "cerrado" | "cancelado";
  iniciadoAt: string;
  modo: "real" | "simulacro";
}

// El embed de Supabase (`tabla(...)`) puede venir como objeto único o
// array de uno según la relación — mismo caso ya resuelto en
// frontend-web/src/lib/sitios.ts, mismo tratamiento acá.
function primero<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

interface FilaEventoEmbebido {
  estado: "en_curso" | "cerrado" | "cancelado";
  iniciado_at: string;
  modo: "real" | "simulacro";
  tipos_evento: { nombre: string } | { nombre: string }[] | null;
}

interface FilaConfirmacionPropia {
  id: string;
  evento_id: string;
  estado: EstadoConfirmacion;
  punto_id: string | null;
  eventos: FilaEventoEmbebido | FilaEventoEmbebido[] | null;
}

export async function listarAlertasPropias(): Promise<AlertaPropia[]> {
  const { data, error } = await supabase
    .from("confirmaciones")
    .select("id, evento_id, estado, punto_id, eventos(estado, iniciado_at, modo, tipos_evento(nombre))")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as FilaConfirmacionPropia[])
    .map((c) => {
      const evento = primero(c.eventos);
      const tipo = evento ? primero(evento.tipos_evento) : null;
      if (!evento || !tipo) return null; // fila huérfana rara (evento borrado) — se descarta, no se muestra con datos incompletos
      return {
        confirmacionId: c.id,
        eventoId: c.evento_id,
        estadoConfirmacion: c.estado,
        puntoId: c.punto_id,
        tipoNombre: tipo.nombre,
        eventoEstado: evento.estado,
        iniciadoAt: evento.iniciado_at,
        modo: evento.modo,
      };
    })
    .filter((a): a is AlertaPropia => a !== null);
}

export interface PuntoHabilitado {
  id: string;
  nombre: string;
  descripcion: string | null;
}

interface FilaPuntoEmbebido {
  puntos_encuentro: PuntoHabilitado | PuntoHabilitado[] | null;
}

export async function listarPuntosHabilitadosDeEvento(eventoId: string): Promise<PuntoHabilitado[]> {
  const { data, error } = await supabase
    .from("eventos_puntos_estado")
    .select("habilitado, puntos_encuentro(id, nombre, descripcion)")
    .eq("evento_id", eventoId)
    .eq("habilitado", true);
  if (error) throw error;
  return ((data ?? []) as unknown as FilaPuntoEmbebido[]).map((r) => primero(r.puntos_encuentro)).filter((p): p is PuntoHabilitado => p !== null);
}

export interface ResultadoConfirmar {
  ok: boolean;
  error?: string;
}

export async function confirmar(
  eventoId: string,
  estado: "ok" | "ayuda",
  puntoId: string | null,
  notaAyuda: string | null
): Promise<ResultadoConfirmar> {
  const res = await llamarBackend<{ id: string }>("/confirmaciones", {
    method: "POST",
    body: { eventoId, estado, puntoId, notaAyuda, ubicacionLat: null, ubicacionLng: null },
  });
  if (res.status === 200) return { ok: true };
  return { ok: false, error: "error" in res.body ? res.body.error : "Error inesperado." };
}
