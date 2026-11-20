import type { SalaTipoConstruccion } from "@/lib/database.types";

/** Máximo de fotos generales que se pueden adjuntar al alta de una sala (una sala grande necesita varios ángulos). */
export const SALA_FOTO_GENERAL_MAX = 14;

/**
 * Cuántas fotos van en cada pedido a la IA. Las fotos viajan en el cuerpo del pedido y Vercel limita ese
 * cuerpo a unos 4,5 MB; además varias IAs gratuitas aceptan pocas imágenes por pedido. Una sala con más
 * fotos se analiza en tandas de este tamaño y los resultados se combinan.
 */
export const SALA_FOTO_IA_POR_TANDA = 5;

export const SALA_TIPO_CONSTRUCCION_OPCIONES: SalaTipoConstruccion[] = ["sala_interior", "shelter", "container", "otro"];

export const SALA_TIPO_CONSTRUCCION_LABEL: Record<SalaTipoConstruccion, string> = {
  sala_interior: "Sala interior (dentro de un edificio)",
  shelter: "Shelter",
  container: "Container",
  otro: "Otro",
};
