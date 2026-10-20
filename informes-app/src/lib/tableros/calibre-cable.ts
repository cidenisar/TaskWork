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

export interface CalibreResultado {
  calibreMm2: number | null;
  colores: string | null;
}

/**
 * Calibre y color de cable fijos — valores reales tal como los pasó el
 * usuario (no un default inventado), para cableado que no depende de un
 * amperaje medido:
 * - Todo lo que se alimenta de 12V o 24V: 1,5mm², rojo y negro.
 * - Conexión de la fuente hacia las bornes CON FUSIBLE: 2,5mm², rojo y negro.
 * - Conexión del banco de batería de 24V: 4mm², rojo y negro.
 * - Datos de control de acceso (lectora/cerradura): 1mm², blanco.
 * A diferencia de catalogo_calibre_cable (que depende de la norma/método de
 * instalación de cada obra y por eso es editable en Configuración), esto
 * queda hardcodeado a propósito — es cableado de instalación típica que no
 * varía por sitio.
 */
const CALIBRE_FIJO_POR_CATEGORIA: Partial<Record<TableroCategoriaEquipo, CalibreResultado>> = {
  bornera_fusible: { calibreMm2: 2.5, colores: "Rojo/Negro" },
  bateria: { calibreMm2: 4, colores: "Rojo/Negro" },
  lectora: { calibreMm2: 1, colores: "Blanco" },
  cerradura: { calibreMm2: 1, colores: "Blanco" },
};

/** 24V/12V DC genérico cuando la categoría no tiene un valor fijo propio arriba. */
const CALIBRE_FIJO_DC: CalibreResultado = { calibreMm2: 1.5, colores: "Rojo/Negro" };

/** Código de colores real (220V: fase marrón, neutro celeste; 380V: R marrón, S negro, T rojo, N celeste) — el calibre en sí sigue saliendo del amperaje medido. */
const COLORES_220V = "F:Marrón · N:Celeste";
const COLORES_380V = "R:Marrón · S:Negro · T:Rojo · N:Celeste";

/**
 * Punto único para determinar calibre y color de un circuito del unifilar:
 * térmica/disyuntor va por amperaje medido (banda configurable) + color
 * según fase; el resto va por el valor fijo de instalación típica (por
 * categoría, o genérico para 24V/12V DC); si ninguno aplica, no se muestra
 * nada — nunca se inventa.
 */
export function calcularCalibreCircuito(
  categoriaEquipo: TableroCategoriaEquipo,
  tipoCircuito: TableroTipoCircuito,
  ampNominal: string | null,
  config: ConfigCalibreCable[],
): CalibreResultado {
  if (categoriaLlevaAmp(categoriaEquipo)) {
    const calibreMm2 = calcularCalibreCable(parseAmperaje(ampNominal), config);
    const colores = tipoCircuito === "220v_mono" ? COLORES_220V : tipoCircuito === "380v_tri" ? COLORES_380V : null;
    return { calibreMm2, colores };
  }
  const fijo = CALIBRE_FIJO_POR_CATEGORIA[categoriaEquipo];
  if (fijo) return fijo;
  if (tipoCircuito === "24vdc" || tipoCircuito === "12vdc") return CALIBRE_FIJO_DC;
  return { calibreMm2: null, colores: null };
}

/**
 * Cantidad de conductores del cable según el tipo de circuito — solo para
 * los tipos donde el número de hilos es inequívoco (220V monofásico: F+N;
 * 380V trifásico: R+S+T+N; 24V/12V DC: +/-). El resto (categorías de
 * función como lectora/cámara/bornera sin tipo de circuito cargado) no
 * tiene una cantidad de hilos fija conocida — ahí se muestra solo el
 * calibre, sin inventar un conteo.
 */
const CONDUCTORES_POR_TIPO: Partial<Record<TableroTipoCircuito, number>> = {
  "220v_mono": 2,
  "380v_tri": 4,
  "24vdc": 2,
  "12vdc": 2,
};

/** Formación de cable en la notación de plano real: "<conductores>X<calibre>mm" (ej. "2X1.5mm"), o "<calibre>mm²" cuando no se conoce la cantidad de hilos. */
export function formatearFormacionCable(calibreMm2: number | null, tipoCircuito: TableroTipoCircuito): string | null {
  if (calibreMm2 == null) return null;
  const conductores = CONDUCTORES_POR_TIPO[tipoCircuito];
  return conductores != null ? `${conductores}X${calibreMm2}mm` : `${calibreMm2}mm²`;
}
