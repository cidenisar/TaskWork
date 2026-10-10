import type { EquipoCategoria } from "@/lib/database.types";

/** Fotos de materiales/equipos que se mandan juntas a la IA en una sola lectura (mismo criterio que Equipos Individuales). */
export const MATERIAL_FOTO_IA_MAX = 10;

/** Fotos del remito (puede tener varias páginas, o convenir reintentar una que salió borrosa) — se mandan todas juntas a la IA en una sola lectura. */
export const REMITO_FOTO_MAX = 3;

export interface MaterialInformeItem {
  categoriaEquipo: EquipoCategoria;
  descripcion: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  comentario: string;
  revisar: boolean;
}

export const MATERIAL_INFORME_BASE: Omit<MaterialInformeItem, "descripcion" | "revisar"> = {
  categoriaEquipo: "otro",
  marcaModelo: "",
  numeroSerie: "",
  etiquetaYpf: "",
  cantidad: 1,
  consumoPromedioW: null,
  consumoMaxW: null,
  comentario: "",
};

/**
 * Una línea del remito leída por IA (o cargada a mano): lo que el depósito
 * dice que se entregó. `cantidadSobrante` arranca en 0 — se ajusta si parte
 * (o todo) de esa línea no se usó/instaló; lo que quede con sobrante > 0 se
 * convierte en la devolución automática a depósito al guardar el informe.
 */
export interface RemitoItem {
  descripcion: string;
  cantidadEsperada: number;
  cantidadSobrante: number;
}
