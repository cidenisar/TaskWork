import type { TableroTipo } from "@/lib/database.types";

export const TABLERO_TIPOS: TableroTipo[] = ["energia", "cctv", "control_acceso"];

export const TABLERO_TIPO_LABEL: Record<TableroTipo, string> = {
  energia: "Energía",
  cctv: "CCTV",
  control_acceso: "Control de Acceso",
};

/** Solo energía mide corriente por fase — CCTV/Control de Acceso son relevamiento de estado. */
export function esTipoEnergia(tipo: TableroTipo): boolean {
  return tipo === "energia";
}

export const ESTADO_OPCIONES: Record<TableroTipo, string[]> = {
  energia: ["Cerrado", "Abierto", "Disparado"],
  cctv: ["Funciona", "No funciona", "Revisar"],
  control_acceso: ["Funciona", "No funciona", "Revisar"],
};

export interface CircuitoItem {
  /** null = circuito nuevo, todavía no existe en tablero_circuitos. */
  id: string | null;
  numero: number;
  texto: string;
  ampNominal: string;
}

export interface TableroConCircuitos {
  id: string;
  tipo: TableroTipo;
  denominacion: string;
  sitio: string;
  circuitos: CircuitoItem[];
}

export interface LecturaForm {
  circuitoId: string | null;
  numero: number;
  texto: string;
  ampNominal: string;
  estado: string;
  corrienteF: string;
  corrienteR: string;
  corrienteS: string;
  corrienteT: string;
  comentario: string;
}
