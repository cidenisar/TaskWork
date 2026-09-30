import type { RackCategoriaEquipo } from "@/lib/database.types";

/** Máximo de fotos que se pueden mandar juntas a la lectura con IA de un rack (distintos ángulos/secciones del mismo rack). */
export const RACK_FOTO_IA_MAX = 7;

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
