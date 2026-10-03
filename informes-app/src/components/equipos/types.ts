import type { EquipoCategoria } from "@/lib/database.types";

/** Máximo de fotos que se pueden mandar juntas a la lectura con IA (distintos equipos sueltos, o distintos ángulos del mismo). */
export const EQUIPO_FOTO_IA_MAX = 7;

export const CATEGORIA_EQUIPO_OPCIONES: EquipoCategoria[] = [
  "ups",
  "banco_baterias",
  "camara_cctv",
  "control_acceso",
  "impresora",
  "telefonia",
  "climatizacion",
  "otro",
];

export const CATEGORIA_EQUIPO_LABEL: Record<EquipoCategoria, string> = {
  ups: "UPS",
  banco_baterias: "Banco de baterías",
  camara_cctv: "Cámara CCTV",
  control_acceso: "Control de acceso",
  impresora: "Impresora",
  telefonia: "Telefonía",
  climatizacion: "Climatización",
  otro: "Otro",
};

export const ESTADO_OPCIONES: string[] = ["Funciona", "No funciona", "Revisar"];

export interface EquipoItem {
  /** null = equipo nuevo, todavía no existe en equipos. */
  id: string | null;
  categoriaEquipo: EquipoCategoria;
  texto: string;
  marcaModelo: string;
  numeroSerie: string;
  cantidad: number;
  /**
   * Solo transitorio en el form (no se persiste): true cuando lo cargó la
   * lectura de foto con IA sin encontrar una etiqueta/chapa legible, así el
   * técnico sabe que el texto es una descripción visual y conviene
   * verificarlo/corregirlo antes de guardar.
   */
  revisar?: boolean;
}

/** Resumen del equipamiento relevado — se muestra en pantalla mientras se carga y se imprime en el PDF. */
export interface ResumenEquipos {
  total: number;
  porCategoria: { categoria: EquipoCategoria; cantidad: number }[];
}

export function calcularResumenEquipos(items: { categoriaEquipo: EquipoCategoria; cantidad: number }[]): ResumenEquipos {
  const porCategoriaMap = new Map<EquipoCategoria, number>();
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
