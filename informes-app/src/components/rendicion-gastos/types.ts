import type { Moneda } from "@/lib/database.types";

export interface RendicionFormState {
  motivo: string;
  fecha: string;
  proyectoCliente: string;
  provincia: string;
  viaticoRecibido: string;
  moneda: Moneda;
}

export const EMPTY_RENDICION_FORM: RendicionFormState = {
  motivo: "",
  fecha: new Date().toISOString().slice(0, 10),
  proyectoCliente: "",
  provincia: "",
  viaticoRecibido: "",
  moneda: "ARS",
};

export interface GastoTecnicoChip {
  nombre: string;
  torre: string;
}

export interface CatalogosRendicion {
  provincias: string[];
  categoriasGasto: string[];
  tecnicos: { nombre: string; torre: string | null }[];
  torres: string[];
}
