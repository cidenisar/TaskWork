/** Fotos de materiales instalados que se mandan juntas a la IA en una sola lectura (mismo criterio que Entregas a Depósito). */
export const INSTALACION_FOTO_IA_MAX = 10;

export interface MaterialInstaladoItem {
  descripcion: string;
  categoria: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  comentario: string;
  revisar: boolean;
}

export const MATERIAL_INSTALADO_BASE: Omit<MaterialInstaladoItem, "descripcion" | "revisar"> = {
  categoria: "",
  marcaModelo: "",
  numeroSerie: "",
  etiquetaYpf: "",
  cantidad: 1,
  comentario: "",
};

/**
 * Una línea del remito leída por IA (o cargada a mano): lo que el depósito
 * dice que se entregó. `cantidadSobrante` arranca en 0 — el técnico la
 * ajusta si parte (o todo) de esa línea no se instaló; lo que quede con
 * sobrante > 0 se convierte en la devolución automática a depósito al
 * guardar.
 */
export interface RemitoItem {
  descripcion: string;
  cantidadEsperada: number;
  cantidadSobrante: number;
}
