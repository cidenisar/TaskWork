import type { RackCategoriaEquipo } from "@/lib/database.types";

/**
 * Máximo de fotos que se pueden mandar juntas a la lectura con IA de un
 * rack (distintos ángulos/secciones del mismo rack). Un rack con mucho
 * equipamiento necesita fotos de frente Y de atrás (las etiquetas/puertos
 * no se ven todos desde un solo lado) — 7 se quedaba corto para esos
 * casos y la IA perdía equipos.
 */
export const RACK_FOTO_IA_MAX = 14;

/** Fotos generales del rack que quedan como registro (delantera, trasera, otros ángulos de detalle) — no se procesan con IA. */
export const RACK_FOTO_GENERAL_MAX = 4;

export const CATEGORIA_EQUIPO_OPCIONES: RackCategoriaEquipo[] = [
  "router",
  "switch",
  "servidor",
  "rectificador",
  "banco_baterias",
  "ups",
  "odf",
  "patch_panel",
  "radio_enlace",
  "convertidor_medios",
  "firewall",
  "multiplexor",
  "pdu_regleta",
  "otro",
];

export const CATEGORIA_EQUIPO_LABEL: Record<RackCategoriaEquipo, string> = {
  router: "Router",
  switch: "Switch",
  servidor: "Servidor",
  rectificador: "Rectificador",
  banco_baterias: "Banco de baterías",
  ups: "UPS",
  odf: "ODF",
  patch_panel: "Patch panel",
  radio_enlace: "Radio/Enlace",
  convertidor_medios: "Convertidor de medios",
  firewall: "Firewall",
  multiplexor: "Multiplexor",
  pdu_regleta: "PDU/Regleta",
  otro: "Otro",
};

export const ESTADO_OPCIONES: string[] = ["Funciona", "No funciona", "Revisar"];

export interface EquipamientoItem {
  /** null = equipo nuevo, todavía no existe en rack_equipamientos. */
  id: string | null;
  numero: number;
  categoriaEquipo: RackCategoriaEquipo;
  texto: string;
  marcaModelo: string;
  posicionU: string;
  cantidad: number;
  /** Número de la etiqueta/chapa de inventario de YPF, si es legible — distinto del número de serie del fabricante. */
  etiquetaYpf: string;
  /** N° de serie de fábrica (impreso por el fabricante), distinto de etiquetaYpf. */
  numeroSerie: string;
  /** Puertos/bocas libres del equipo — manual (la IA no lo infiere con confianza desde una foto), se completa al dar de alta. */
  bocasDisponibles: number | null;
  /**
   * Consumo típico ESTIMADO por IA en Watts a partir de la marca/modelo
   * (nunca una medición real, a diferencia de la corriente de Tableros) —
   * en uso normal (`consumoPromedioW`) y pico/máximo (`consumoMaxW`, que
   * puede acercarse al vatiaje nominal de la fuente del equipo sin ser
   * necesariamente el mismo número). Null si todavía no se estimó, o la
   * IA no reconoció el modelo con confianza suficiente.
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

export interface RackConEquipamiento {
  id: string;
  denominacion: string;
  /** Etiqueta/chapa de inventario de YPF del rack en sí (para ServiceNow) — distinta de la denominación. */
  etiquetaYpf: string | null;
  ubicacionId: string;
  ubicacionLabel: string;
  equipamiento: EquipamientoItem[];
}

export interface LecturaForm {
  equipamientoId: string | null;
  numero: number;
  texto: string;
  marcaModelo: string;
  posicionU: string;
  cantidad: number;
  estado: string;
  comentario: string;
}

/** Resumen del equipamiento relevado — se muestra en pantalla mientras se carga y se imprime en el PDF. */
export interface ResumenEquipamiento {
  total: number;
  porCategoria: { categoria: RackCategoriaEquipo; cantidad: number }[];
}

export function calcularResumenEquipamiento(items: { categoriaEquipo: RackCategoriaEquipo; cantidad: number }[]): ResumenEquipamiento {
  const porCategoriaMap = new Map<RackCategoriaEquipo, number>();
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
