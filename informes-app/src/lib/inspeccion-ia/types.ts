import type { EstadoChecklist, ModuloInspeccionIa } from "@/lib/database.types";

export type { ModuloInspeccionIa };

/** Ítem del catálogo admin-configurable de un módulo (ver catalogo_inspeccion_ia). */
export interface ItemInspeccionIa {
  id: string;
  texto: string;
}

/**
 * Resultado de Inspección IA para un ítem del catálogo, evaluado contra las
 * mismas fotos que el módulo ya usa para identificar lo suyo (circuitos,
 * equipamiento, tramos de torre, etc.) — reusa el mismo estado de 3 valores
 * que el checklist de mantenimiento (ok/no_ok/no_aplica): "no_ok" = se
 * detectó el ítem. `estado: null` = todavía no se evaluó (ni la IA ni el
 * técnico a mano) — esos ítems no se guardan si el técnico no los toca,
 * igual criterio que el checklist de mantenimiento.
 */
export interface HallazgoInspeccionIa {
  itemId: string;
  texto: string;
  estado: EstadoChecklist | null;
  comentario: string;
}

export const HALLAZGO_ESTADO_LABEL: Record<EstadoChecklist, string> = {
  ok: "Sin novedad",
  no_ok: "Hallazgo detectado",
  no_aplica: "No se pudo evaluar",
};

/**
 * El técnico puede leer varias tandas de fotos con IA (ej. una por cuerpo o
 * sección del relevamiento) — cada tanda vuelve a evaluar el catálogo
 * COMPLETO contra esas fotos en particular, así que hay que combinar
 * resultados en vez de pisarlos: una vez que una tanda detecta un hallazgo
 * ("no_ok"), se mantiene aunque una tanda posterior (de otra parte del
 * relevamiento) no lo vea — nunca se "limpia" un hallazgo real porque la
 * siguiente foto no lo mostraba. Fuera de ese caso, se prioriza el
 * resultado más informativo (cualquiera sobre null/"no_aplica").
 */
export function mezclarHallazgos(previos: HallazgoInspeccionIa[], nuevos: HallazgoInspeccionIa[]): HallazgoInspeccionIa[] {
  const porId = new Map(previos.map((h) => [h.itemId, h]));
  for (const nuevo of nuevos) {
    const previo = porId.get(nuevo.itemId);
    if (!previo) {
      porId.set(nuevo.itemId, nuevo);
      continue;
    }
    if (previo.estado === "no_ok") continue; // ya detectado — se mantiene, nunca se pisa
    if (previo.estado === null || previo.estado === "no_aplica" || nuevo.estado === "no_ok") {
      porId.set(nuevo.itemId, nuevo);
    }
  }
  return [...porId.values()];
}
