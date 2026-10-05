import type { TorreComunicacionCategoriaEquipo } from "@/lib/database.types";

/**
 * Máximo de fotos que se pueden mandar juntas a la lectura con IA de una
 * torre (distintos ángulos/alturas del mismo equipamiento). Igual criterio
 * que Racks: con mucho equipamiento montado hace falta más de un ángulo
 * por elemento para no perder detecciones.
 */
export const TORRE_FOTO_IA_MAX = 14;

/** Fotos generales de la torre que quedan como registro (distintos ángulos/alturas de detalle) — no se procesan con IA. */
export const TORRE_FOTO_GENERAL_MAX = 4;

export const CATEGORIA_EQUIPO_OPCIONES: TorreComunicacionCategoriaEquipo[] = [
  "antena",
  "radioenlace",
  "antena_celular",
  "baliza",
  "pararrayos",
  "cableado_feeder",
  "otro",
];

export const CATEGORIA_EQUIPO_LABEL: Record<TorreComunicacionCategoriaEquipo, string> = {
  antena: "Antena",
  radioenlace: "Radioenlace/Microonda",
  antena_celular: "Antena celular/trunking",
  baliza: "Baliza de obstrucción",
  pararrayos: "Pararrayos",
  cableado_feeder: "Cableado/Feeder",
  otro: "Otro",
};

export const ESTADO_OPCIONES: string[] = ["Funciona", "No funciona", "Revisar"];

export interface EquipamientoTorreItem {
  /** null = equipo nuevo, todavía no existe en torre_comunicacion_equipamientos. */
  id: string | null;
  numero: number;
  categoriaEquipo: TorreComunicacionCategoriaEquipo;
  texto: string;
  marcaModelo: string;
  /** Altura en la torre, texto libre (ej. "24m") — no siempre se puede medir con precisión en el momento. */
  alturaM: string;
  cantidad: number;
  /** Número de la etiqueta/chapa de inventario de YPF, si es legible — distinto del número de serie del fabricante. */
  etiquetaYpf: string;
  /**
   * Consumo típico ESTIMADO por IA en Watts a partir de la marca/modelo —
   * null para equipamiento pasivo (antenas) o si la IA no reconoció el
   * modelo con confianza suficiente.
   */
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  /**
   * Solo transitorio en el form (no se persiste): true cuando lo cargó la
   * lectura de foto con IA sin encontrar una etiqueta legible, así el
   * técnico sabe que el texto es una descripción visual y conviene
   * verificarlo/corregirlo antes de guardar.
   */
  revisar?: boolean;
}

export interface TorreConEquipamiento {
  id: string;
  denominacion: string;
  ubicacionId: string;
  ubicacionLabel: string;
  equipamiento: EquipamientoTorreItem[];
}

/** Resumen del equipamiento relevado — se muestra en pantalla mientras se carga y se imprime en el PDF. */
export interface ResumenEquipamientoTorre {
  total: number;
  porCategoria: { categoria: TorreComunicacionCategoriaEquipo; cantidad: number }[];
}

export function calcularResumenEquipamientoTorre(
  items: { categoriaEquipo: TorreComunicacionCategoriaEquipo; cantidad: number }[],
): ResumenEquipamientoTorre {
  const porCategoriaMap = new Map<TorreComunicacionCategoriaEquipo, number>();
  let total = 0;
  for (const it of items) {
    const cant = Number.isFinite(it.cantidad) && it.cantidad > 0 ? it.cantidad : 1;
    porCategoriaMap.set(it.categoriaEquipo, (porCategoriaMap.get(it.categoriaEquipo) ?? 0) + cant);
    total += cant;
  }
  const porCategoria = CATEGORIA_EQUIPO_OPCIONES.map((categoria) => ({ categoria, cantidad: porCategoriaMap.get(categoria) ?? 0 }))
    .filter((c) => c.cantidad > 0)
    .sort((a, b) => b.cantidad - a.cantidad);
  return { total, porCategoria };
}
