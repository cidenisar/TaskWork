// Capa de datos de "Accountability en Vivo" — ver Cowork "Accountability
// en Vivo" y backend-server/README.md ("Contador incremental de
// Accountability"). Todo lectura directa contra Supabase — org_isolation
// ya le da a un admin acceso completo a eventos/confirmaciones/
// accountability_contadores/puntos_encuentro/consolas de su
// organización, no hace falta backend-server para nada de esto.

import { supabase } from "./supabase";
import { unwrapEmbed } from "./unwrapEmbed";

export interface EventoActivo {
  id: string;
  tipoNombre: string;
  modo: "real" | "simulacro";
  operadorNombre: string | null;
  consolaNombre: string | null;
  iniciadoAt: string;
}

export async function getEventoActivo(sitioId: string): Promise<EventoActivo | null> {
  const { data, error } = await supabase
    .from("eventos")
    .select("id, modo, iniciado_at, tipos_evento(nombre), operadores(nombre), consolas(nombre)")
    .eq("sitio_id", sitioId)
    .eq("estado", "en_curso")
    .order("iniciado_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const tipo = unwrapEmbed<{ nombre: string }>(data.tipos_evento as never);
  const op = unwrapEmbed<{ nombre: string }>(data.operadores as never);
  const consola = unwrapEmbed<{ nombre: string }>(data.consolas as never);
  return {
    id: data.id as string,
    modo: data.modo as "real" | "simulacro",
    iniciadoAt: data.iniciado_at as string,
    tipoNombre: tipo?.nombre ?? "Evento",
    operadorNombre: op?.nombre ?? null,
    consolaNombre: consola?.nombre ?? null,
  };
}

export interface ContadorPunto {
  puntoId: string | null;
  puntoNombre: string;
  ok: number;
  ayuda: number;
  pendiente: number;
}

export interface Totales {
  ok: number;
  ayuda: number;
  pendiente: number;
  total: number;
}

/**
 * Muestra TODOS los puntos activos del sitio (aunque nadie los haya
 * elegido todavía, con 0/0/0) más un bucket "Sin punto asignado" si
 * corresponde — mismo criterio visual que el wireframe (las 4 tarjetas
 * siempre están, no solo las que ya tienen gente).
 */
export async function getContadores(eventoId: string, sitioId: string): Promise<{ totales: Totales; porPunto: ContadorPunto[] }> {
  const [{ data: contadores, error: cErr }, { data: puntos, error: pErr }] = await Promise.all([
    supabase.from("accountability_contadores").select("punto_id, ok, ayuda, pendiente").eq("evento_id", eventoId),
    supabase.from("puntos_encuentro").select("id, nombre").eq("sitio_id", sitioId).eq("activo", true).order("nombre"),
  ]);
  if (cErr) throw cErr;
  if (pErr) throw pErr;

  const contadorPorPunto = new Map<string, { ok: number; ayuda: number; pendiente: number }>();
  let sinPunto = { ok: 0, ayuda: 0, pendiente: 0 };
  for (const c of contadores ?? []) {
    const fila = { ok: c.ok as number, ayuda: c.ayuda as number, pendiente: c.pendiente as number };
    if (c.punto_id) contadorPorPunto.set(c.punto_id as string, fila);
    else sinPunto = fila;
  }

  const porPunto: ContadorPunto[] = (puntos ?? []).map((p) => {
    const c = contadorPorPunto.get(p.id as string) ?? { ok: 0, ayuda: 0, pendiente: 0 };
    return { puntoId: p.id as string, puntoNombre: p.nombre as string, ...c };
  });
  if (sinPunto.ok + sinPunto.ayuda + sinPunto.pendiente > 0) {
    porPunto.push({ puntoId: null, puntoNombre: "Sin punto asignado", ...sinPunto });
  }

  const totales = porPunto.reduce(
    (acc, c) => ({ ok: acc.ok + c.ok, ayuda: acc.ayuda + c.ayuda, pendiente: acc.pendiente + c.pendiente, total: acc.total + c.ok + c.ayuda + c.pendiente }),
    { ok: 0, ayuda: 0, pendiente: 0, total: 0 }
  );
  return { totales, porPunto };
}

export interface ConfirmacionDetalle {
  id: string;
  personaId: string;
  nombre: string;
  dni: string;
  legajo: string | null;
  tipo: "fijo" | "eventual";
  telefono: string;
  estado: "ok" | "ayuda" | "pendiente";
  puntoId: string | null;
  puntoNombre: string | null;
  notaAyuda: string | null;
  confirmadoAt: string | null;
}

export async function getConfirmaciones(eventoId: string): Promise<ConfirmacionDetalle[]> {
  const { data, error } = await supabase
    .from("confirmaciones")
    .select("id, persona_id, estado, punto_id, nota_ayuda, confirmado_at, personas(nombre, dni, legajo, tipo, telefono), puntos_encuentro(nombre)")
    .eq("evento_id", eventoId);
  if (error) throw error;
  return (data ?? []).map((c) => {
    const persona = unwrapEmbed<{ nombre: string; dni: string; legajo: string | null; tipo: "fijo" | "eventual"; telefono: string }>(c.personas as never);
    const punto = unwrapEmbed<{ nombre: string }>(c.puntos_encuentro as never);
    return {
      id: c.id as string,
      personaId: c.persona_id as string,
      nombre: persona?.nombre ?? "—",
      dni: persona?.dni ?? "—",
      legajo: persona?.legajo ?? null,
      tipo: persona?.tipo ?? "fijo",
      telefono: persona?.telefono ?? "",
      estado: c.estado as "ok" | "ayuda" | "pendiente",
      puntoId: c.punto_id as string | null,
      puntoNombre: punto?.nombre ?? null,
      notaAyuda: c.nota_ayuda as string | null,
      confirmadoAt: c.confirmado_at as string | null,
    };
  });
}
