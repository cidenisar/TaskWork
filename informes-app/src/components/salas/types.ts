import type { SalaTipoConstruccion } from "@/lib/database.types";

/** Máximo de fotos generales que se pueden adjuntar al alta de una sala. */
export const SALA_FOTO_GENERAL_MAX = 6;

export const SALA_TIPO_CONSTRUCCION_OPCIONES: SalaTipoConstruccion[] = ["sala_interior", "shelter", "container", "otro"];

export const SALA_TIPO_CONSTRUCCION_LABEL: Record<SalaTipoConstruccion, string> = {
  sala_interior: "Sala interior (dentro de un edificio)",
  shelter: "Shelter",
  container: "Container",
  otro: "Otro",
};
