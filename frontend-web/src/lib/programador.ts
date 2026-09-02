// Capa de datos de "Programador de Simulacros" — ver Cowork y
// backend-server/README.md. Listar tipos de evento y los "próximos"
// simulacros de un sitio es lectura directa contra Supabase
// (org_isolation ya se lo permite a un admin, mismo criterio que
// Puntos de encuentro). Programar/editar/cancelar SÍ pasan por
// backend-server — a diferencia de Puntos de encuentro, necesitan el
// motor de fechas real (una ocurrencia recurrente nueva usa el mismo
// cálculo que ya usa el backend para generar la próxima — replicarlo
// acá arriesgaba una diferencia sutil de fin de mes) y necesitan
// re-publicar `consolas/{id}/simulacro` al toque (el cliente MQTT solo
// vive en backend-server).
//
// Formato de fecha/hora: todo el sistema trata `fecha_hora` como UTC
// literal, sin ninguna conversión de zona horaria por sitio (ver
// backend-server/src/logic/recurrencia.ts) — por eso acá se formatea
// con los métodos getUTC*, NUNCA con el huso horario del navegador
// (toLocaleDateString, como hace lib/tiempoRelativo.ts para fechas
// menos sensibles al huso — ver frontend-web/README.md, nota sobre
// esta inconsistencia encontrada de paso).

import { supabase } from "./supabase";
import { llamarBackend } from "./backend";

export interface TipoEventoOpcion {
  id: string;
  nombre: string;
}

export async function listarTiposEvento(organizacionId: string): Promise<TipoEventoOpcion[]> {
  const { data, error } = await supabase
    .from("tipos_evento")
    .select("id, nombre")
    .or(`organizacion_id.is.null,organizacion_id.eq.${organizacionId}`)
    .order("nombre");
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id as string, nombre: t.nombre as string }));
}

export type Posicion = 1 | 2 | 3 | 4 | -1;

export interface ReglaRecurrenciaFila {
  diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  posicion: Posicion;
  cadaMeses: number;
}

export interface SimulacroProximo {
  id: string;
  tipoEventoId: string;
  tipoEventoNombre: string;
  puntual: boolean;
  fechaHora: string; // ISO, UTC
  recurrencia: ReglaRecurrenciaFila | null;
  estado: "programado" | "pendiente_confirmacion";
}

export async function listarProximos(sitioId: string): Promise<SimulacroProximo[]> {
  const { data, error } = await supabase
    .from("simulacros_programados")
    .select("id, tipo_evento_id, puntual, fecha_hora, estado, recurrencia, tipos_evento(nombre)")
    .eq("sitio_id", sitioId)
    .in("estado", ["programado", "pendiente_confirmacion"])
    .order("fecha_hora", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => {
    const tipo = s.tipos_evento as unknown as { nombre: string } | { nombre: string }[] | null;
    const tipoEventoNombre = Array.isArray(tipo) ? (tipo[0]?.nombre ?? "(tipo desconocido)") : (tipo?.nombre ?? "(tipo desconocido)");
    return {
      id: s.id as string,
      tipoEventoId: s.tipo_evento_id as string,
      tipoEventoNombre,
      puntual: s.puntual as boolean,
      fechaHora: s.fecha_hora as string,
      recurrencia: s.recurrencia as ReglaRecurrenciaFila | null,
      estado: s.estado as "programado" | "pendiente_confirmacion",
    };
  });
}

export interface PayloadProgramar {
  sitioId: string;
  tipoEventoId: string;
  puntual: boolean;
  fecha: string | null; // "YYYY-MM-DD", si puntual
  hora: string; // "HH:MM"
  diaSemana: number | null; // si !puntual
  posicion: Posicion | null; // si !puntual
}

export type ResultadoProgramar = { ok: true } | { ok: false; error: string };

export async function programarSimulacro(input: PayloadProgramar): Promise<ResultadoProgramar> {
  const r = await llamarBackend("/simulacros", { method: "POST", body: input });
  if (r.status !== 201 || (typeof r.body === "object" && r.body !== null && "error" in r.body)) {
    const error = typeof r.body === "object" && r.body !== null && "error" in r.body ? (r.body as { error: string }).error : "Error inesperado programando el simulacro.";
    return { ok: false, error };
  }
  return { ok: true };
}

export async function editarSimulacro(id: string, input: PayloadProgramar): Promise<ResultadoProgramar> {
  const r = await llamarBackend(`/simulacros/${id}`, { method: "PATCH", body: input });
  if (r.status !== 200 || (typeof r.body === "object" && r.body !== null && "error" in r.body)) {
    const error = typeof r.body === "object" && r.body !== null && "error" in r.body ? (r.body as { error: string }).error : "Error inesperado guardando los cambios.";
    return { ok: false, error };
  }
  return { ok: true };
}

export async function cancelarSimulacro(id: string): Promise<ResultadoProgramar> {
  const r = await llamarBackend(`/simulacros/${id}`, { method: "DELETE" });
  if (r.status !== 200 || (typeof r.body === "object" && r.body !== null && "error" in r.body)) {
    const error = typeof r.body === "object" && r.body !== null && "error" in r.body ? (r.body as { error: string }).error : "Error inesperado cancelando el simulacro.";
    return { ok: false, error };
  }
  return { ok: true };
}

// --- Formato — ver nota arriba sobre por qué UTC y no huso local ---

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const OCURRENCIAS: { valor: Posicion; label: string }[] = [
  { valor: 1, label: "Primer" },
  { valor: 2, label: "Segundo" },
  { valor: 3, label: "Tercer" },
  { valor: 4, label: "Cuarto" },
  { valor: -1, label: "Último" },
];

export function formatearFechaHoraUTC(iso: string): string {
  const d = new Date(iso);
  const dia = DIAS_CORTOS[d.getUTCDay()];
  const mes = MESES_CORTOS[d.getUTCMonth()];
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dia} ${d.getUTCDate()} ${mes} · ${hh}:${mm}`;
}

export function formatearRecurrencia(r: ReglaRecurrenciaFila): string {
  const ocurrencia = OCURRENCIAS.find((o) => o.valor === r.posicion)?.label ?? r.posicion;
  return `${ocurrencia} ${DIAS_SEMANA[r.diaSemana]} de cada mes`;
}

export function horaUTC(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function fechaUTC(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
