import type { EstadoViaje } from "@/lib/database.types";

/** Sin hora de llegada estimada (las evaluaciones anteriores a ese campo): un viaje en curso se marca demorado pasadas estas horas desde que salió. */
export const HORAS_TOPE_SIN_LLEGADA_ESTIMADA = 12;
/** Margen después de la hora estimada de llegada antes de dar la alarma (tráfico, una parada, etc.). */
export const TOLERANCIA_DEMORA_MIN = 30;

export interface DatosDemora {
  estado: EstadoViaje;
  /** Hora estimada de llegada cargada al crear la evaluación — null en las anteriores a ese campo. */
  llegadaEstimadaAt: string | null;
  iniciadoAt: string | null;
  /** Fecha y hora programada de salida. */
  fechaHora: string;
}

export interface Demora {
  demorado: boolean;
  /** Cuánto se pasó de su horario (de la hora estimada de llegada, o del tope de horas si no la tiene). 0 si no está demorado. */
  horasDeDemora: number;
  /** true si se calculó contra la hora estimada de llegada; false si fue contra el tope de horas desde que salió. */
  porLlegadaEstimada: boolean;
}

const HORA_MS = 3_600_000;

/**
 * ¿Un viaje en curso ya se pasó de su horario? Solo aplica mientras el viaje
 * está en marcha (en viaje o en punto medio): uno sin iniciar o ya finalizado
 * nunca está "demorado". Con hora estimada de llegada se compara contra esa
 * hora (más una tolerancia); sin ella, contra HORAS_TOPE_SIN_LLEGADA_ESTIMADA
 * desde que salió (o desde la fecha programada si no quedó registrada la salida).
 */
export function calcularDemora(v: DatosDemora, ahora: Date = new Date()): Demora {
  const sinDemora: Demora = { demorado: false, horasDeDemora: 0, porLlegadaEstimada: v.llegadaEstimadaAt !== null };
  if (v.estado !== "iniciado" && v.estado !== "en_punto_medio") return sinDemora;

  if (v.llegadaEstimadaAt) {
    const llegada = new Date(v.llegadaEstimadaAt).getTime();
    if (!Number.isFinite(llegada)) return sinDemora;
    const pasadoMs = ahora.getTime() - llegada;
    if (pasadoMs <= TOLERANCIA_DEMORA_MIN * 60_000) return sinDemora;
    return { demorado: true, horasDeDemora: pasadoMs / HORA_MS, porLlegadaEstimada: true };
  }

  const desde = new Date(v.iniciadoAt ?? v.fechaHora).getTime();
  if (!Number.isFinite(desde)) return { ...sinDemora, porLlegadaEstimada: false };
  const horasEnCurso = (ahora.getTime() - desde) / HORA_MS;
  if (horasEnCurso <= HORAS_TOPE_SIN_LLEGADA_ESTIMADA) return { ...sinDemora, porLlegadaEstimada: false };
  return { demorado: true, horasDeDemora: horasEnCurso - HORAS_TOPE_SIN_LLEGADA_ESTIMADA, porLlegadaEstimada: false };
}

/** "menos de 1 h", "5 h", "2 días" — para mostrar cuánto se pasó. */
export function formatearDemora(horas: number): string {
  if (horas < 1) return "menos de 1 h";
  if (horas >= 48) return `${Math.floor(horas / 24)} días`;
  return `${Math.floor(horas)} h`;
}
