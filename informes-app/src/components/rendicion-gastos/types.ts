import type { Moneda } from "@/lib/database.types";

export interface RendicionFormState {
  motivo: string;
  fecha: string;
  proyectoCliente: string;
  viaticoRecibido: string;
  moneda: Moneda;
}

export const EMPTY_RENDICION_FORM: RendicionFormState = {
  motivo: "",
  fecha: new Date().toISOString().slice(0, 10),
  proyectoCliente: "",
  viaticoRecibido: "",
  moneda: "ARS",
};

export interface GastoTecnicoChip {
  nombre: string;
  torre: string;
}

export interface CatalogosRendicion {
  categoriasGasto: string[];
  tecnicos: { nombre: string; torre: string | null }[];
  torres: string[];
}

/** Máximo de fotos de tickets por lectura con IA — mismo criterio que REMITO_FOTO_MAX (ver materiales-types.ts): suficiente para una carga típica, sin pasarse de tokens por request. */
export const TICKETS_FOTO_MAX = 12;
