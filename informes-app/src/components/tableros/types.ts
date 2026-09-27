import type { TableroEventoTipo, TableroTipo } from "@/lib/database.types";

export const TABLERO_TIPOS: TableroTipo[] = ["energia", "cctv", "control_acceso"];

export const TABLERO_TIPO_LABEL: Record<TableroTipo, string> = {
  energia: "Energía",
  cctv: "CCTV",
  control_acceso: "Control de Acceso",
};

export const TABLERO_EVENTO_TIPOS: TableroEventoTipo[] = ["medicion", "relevamiento"];

export const TABLERO_EVENTO_LABEL: Record<TableroEventoTipo, string> = {
  medicion: "Medición",
  relevamiento: "Relevamiento",
};

/**
 * Solo un tablero de energía en una visita de tipo "medición" pide corriente
 * por fase — un relevamiento (cualquier tipo de tablero) es un chequeo más
 * liviano, solo estado + comentario. CCTV/Control de Acceso nunca miden
 * corriente, da igual el tipo de evento.
 */
export function pideCorrientePorFase(tipo: TableroTipo, tipoEvento: TableroEventoTipo): boolean {
  return tipo === "energia" && tipoEvento === "medicion";
}

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
  /**
   * Solo transitorio en el form (no se persiste): true cuando lo cargó la
   * lectura de foto con IA sin encontrar una etiqueta legible, así el
   * técnico sabe que el texto es una descripción visual y conviene
   * verificarlo/corregirlo antes de guardar.
   */
  revisar?: boolean;
}

export interface TableroConCircuitos {
  id: string;
  tipo: TableroTipo;
  denominacion: string;
  sitio: string;
  circuitos: CircuitoItem[];
}

export interface MantenimientoRow {
  id: string;
  tableroId: string;
  tableroDenominacion: string;
  tableroSitio: string;
  circuitoTexto: string | null;
  fecha: string;
  descripcion: string;
  fotoUrl: string | null;
  proximoMantenimiento: string | null;
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
