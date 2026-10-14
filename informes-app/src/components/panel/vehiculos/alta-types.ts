/**
 * Máximo de fotos por lote en el alta de vehículo con IA — exterior
 * (patente/marca/pintura/cubiertas/ópticas) e interior (kilometraje +
 * tapizado/parabrisas desde adentro) se procesan por separado. Se guardan
 * TODAS las fotos de cada lote como galería del estado del vehículo (no
 * solo una representativa) — de ahí el margen más alto que en otros
 * módulos, donde solo importa identificar equipamiento.
 */
export const VEHICULO_EXTERIOR_FOTO_MAX = 8;
export const VEHICULO_INTERIOR_FOTO_MAX = 6;
