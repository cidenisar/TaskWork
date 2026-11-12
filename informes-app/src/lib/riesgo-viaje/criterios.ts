import type { NivelRiesgoViaje } from "@/lib/database.types";

/**
 * Evaluación de Riesgo del Viaje (Anexo IV) — 8 criterios de punto fijo, se
 * elige UNA opción por criterio y se suman los 8 valores. Los textos y
 * puntajes son los del documento de seguridad original: no se inventan ni
 * se ajustan acá, ni siquiera para "redondear" un número.
 */

export interface OpcionCriterio {
  texto: string;
  valor: number;
}

export interface CriterioRiesgoViaje {
  key: CriterioKey;
  label: string;
  opciones: OpcionCriterio[];
}

export type CriterioKey =
  | "distancia"
  | "tiempoViaje"
  | "clima"
  | "tipoRuta"
  | "conocimiento"
  | "comunicacion"
  | "personasPorVehiculo"
  | "horasTrabajadas";

export const CRITERIOS_RIESGO_VIAJE: Record<CriterioKey, CriterioRiesgoViaje> = {
  distancia: {
    key: "distancia",
    label: "A - Distancia",
    opciones: [
      { texto: "Menor 50 Km", valor: 1 },
      { texto: "De 50 a 150 Km", valor: 2 },
      { texto: "De 150 a 300 Km", valor: 3 },
      { texto: "Mayor 300 Km", valor: 8 },
    ],
  },
  tiempoViaje: {
    key: "tiempoViaje",
    label: "B - Tiempo de Viaje",
    opciones: [
      { texto: "Diurno", valor: 0 },
      { texto: "Diurno y Nocturno", valor: 5 },
      { texto: "Nocturno", valor: 10 },
    ],
  },
  clima: {
    key: "clima",
    label: "C - Condición Climática",
    opciones: [
      { texto: "Soleado / Nublado", valor: 1 },
      { texto: "Lluvia / Barro / Viento", valor: 2 },
      { texto: "Tormentas / Niebla", valor: 4 },
      { texto: "Nieve / Heladas", valor: 5 },
    ],
  },
  tipoRuta: {
    key: "tipoRuta",
    label: "D - Tipo de Ruta",
    opciones: [
      { texto: "Pavimentada", valor: 1 },
      { texto: "Mixta Pavimentada", valor: 2 },
      { texto: "No pavimentada", valor: 5 },
      { texto: "Con cornisas", valor: 8 },
    ],
  },
  conocimiento: {
    key: "conocimiento",
    label: "E - Conocimiento del Viaje",
    opciones: [
      { texto: "Conoce bien la ruta", valor: 1 },
      { texto: "La recorrió al menos 1 vez", valor: 2 },
      { texto: "Solo estudió el camino", valor: 3 },
      { texto: "No la conoce", valor: 5 },
    ],
  },
  comunicacion: {
    key: "comunicacion",
    label: "F - Comunicación",
    opciones: [
      { texto: "Celular-Radio", valor: 1 },
      { texto: "Solo en parte del camino", valor: 2 },
      { texto: "Sin comunicación, en convoy", valor: 5 },
      { texto: "Sin comunicación", valor: 8 },
    ],
  },
  personasPorVehiculo: {
    key: "personasPorVehiculo",
    label: "G - Personas por Vehículo",
    opciones: [
      { texto: "1 Vehículo con 1 persona", valor: 6 },
      { texto: "1 vehículo con 2 o más persona", valor: 4 },
      { texto: "2 o más vehículos con 1 persona por vehículo", valor: 2 },
      { texto: "2 o más vehículos con 2 o más personas por vehículo", valor: 1 },
    ],
  },
  horasTrabajadas: {
    key: "horasTrabajadas",
    label: "H - Total Horas Trabajadas + Tiempo de Conducción",
    opciones: [
      { texto: "Menor a 8 hs", valor: 2 },
      { texto: "Entre 8 y 12 hs", valor: 4 },
      { texto: "Entre 12 y 16 hs", valor: 5 },
      { texto: "Mayor a 16 hs", valor: 15 },
    ],
  },
};

/** Valor de distancia que sugiere (no obliga) cargar un punto medio — ver CRITERIOS_Y_IDEAS.md. */
export const DISTANCIA_SUGIERE_PUNTO_MEDIO = CRITERIOS_RIESGO_VIAJE.distancia.opciones.find((o) => o.texto === "Mayor 300 Km")!.valor;

export interface ResultadoRiesgoViaje {
  total: number;
  nivel: NivelRiesgoViaje;
  mensaje: string;
}

/**
 * Umbrales y mensajes tal cual el documento original: 1-20 bajo, 21-30
 * medio, >30 alto. No contempla "sin completar" (total<=0) porque acá los 8
 * criterios son obligatorios antes de poder calcular nada.
 */
export function calcularRiesgoViaje(criterios: Record<CriterioKey, number>): ResultadoRiesgoViaje {
  const total = Object.values(criterios).reduce((acc, v) => acc + v, 0);
  if (total <= 20) return { total, nivel: "bajo", mensaje: "Puede realizar el viaje" };
  if (total <= 30) return { total, nivel: "medio", mensaje: "Tomar acciones para mitigar los riesgos del viaje." };
  return { total, nivel: "alto", mensaje: "Tomar acciones para mitigar los riesgos o suspender el viaje." };
}
