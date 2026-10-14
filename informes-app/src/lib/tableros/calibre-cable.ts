import { categoriaLlevaAmp } from "@/components/tableros/types";
import type { TableroCategoriaEquipo, TableroTipoCircuito } from "@/lib/database.types";

export interface ConfigCalibreCable {
  amperajeMax: number;
  calibreMm2: number;
}

/** Amperaje nominal tal como lo carga el técnico (ej. "32A", "16 A") — nunca se inventa, se lee lo que ya está escrito. */
export function parseAmperaje(ampNominal: string | null): number | null {
  if (!ampNominal) return null;
  const n = Number(ampNominal.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Busca la banda configurada (ver catalogo_calibre_cable) cuyo amperaje_max
 * sea el más chico que alcance a cubrir el amperaje real — nunca inventa un
 * calibre si el amperaje supera la banda más alta configurada.
 */
export function calcularCalibreCable(amperaje: number | null, config: ConfigCalibreCable[]): number | null {
  if (amperaje == null) return null;
  const ordenado = [...config].sort((a, b) => a.amperajeMax - b.amperajeMax);
  const fila = ordenado.find((c) => c.amperajeMax >= amperaje);
  return fila ? fila.calibreMm2 : null;
}

/**
 * Para circuitos que no llevan térmica (cámaras, lectoras, cerraduras,
 * inyectores PoE, alimentación de bornera) el calibre no depende de un
 * amperaje medido — es el cableado de instalación típica para ese tipo de
 * elemento, que no varía por sitio/proyecto. A diferencia de
 * catalogo_calibre_cable (que sí depende de la norma/método de instalación
 * de cada obra y por eso es editable en Configuración), esto queda
 * hardcodeado a propósito — no hace falta una tabla para un valor que
 * siempre es el mismo. Ajustá estos números acá mismo si no coinciden con
 * el criterio real que usa YPF.
 */
const CALIBRE_FIJO_POR_CATEGORIA: Partial<Record<TableroCategoriaEquipo, number>> = {
  camara: 1.5,
  lectora: 1.5,
  cerradura: 1.5,
  inyector_poe: 1.5,
  bornera: 2.5,
  bornera_fusible: 2.5,
};

/** 24V/12V DC genérico cuando la categoría no tiene un valor fijo propio arriba. */
const CALIBRE_FIJO_DC = 1.5;

/**
 * Punto único para determinar el calibre de un circuito del unifilar:
 * térmica/disyuntor va por amperaje medido (banda configurable); el resto
 * va por el valor fijo de instalación típica (por categoría, o genérico
 * para 24V/12V DC); si ninguno aplica, no se muestra calibre — nunca se
 * inventa.
 */
export function calcularCalibreCircuito(
  categoriaEquipo: TableroCategoriaEquipo,
  tipoCircuito: TableroTipoCircuito,
  ampNominal: string | null,
  config: ConfigCalibreCable[],
): number | null {
  if (categoriaLlevaAmp(categoriaEquipo)) {
    return calcularCalibreCable(parseAmperaje(ampNominal), config);
  }
  const fijo = CALIBRE_FIJO_POR_CATEGORIA[categoriaEquipo];
  if (fijo != null) return fijo;
  if (tipoCircuito === "24vdc" || tipoCircuito === "12vdc") return CALIBRE_FIJO_DC;
  return null;
}
