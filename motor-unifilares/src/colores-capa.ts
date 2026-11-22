import type { CapaDxf } from "./types.js";

/**
 * Mismo criterio de color por capa que informes-app (ver
 * lib/pdf/tablero.tsx y lib/dxf/writer.ts, COLOR_ACI_POR_CAPA) — una
 * aproximación legible de cada ACI sobre fondo blanco, para que el PDF se
 * vea igual que el DXF. A_CONFIRMAR en naranja (ACI 30) para que un dato
 * faltante salte a la vista.
 */
export const COLOR_POR_CAPA: Record<CapaDxf, string> = {
  MARCO: "#1a1a1a",
  POTENCIA: "#2a4d8f",
  SIMBOLOS: "#8a6d1a",
  BORNES: "#2a4d8f",
  NUM_CONDUCTOR: "#2a4d8f",
  CABLES: "#8a2be2",
  ETIQUETAS: "#1a7a3c",
  DESTINOS: "#1a7a3c",
  A_CONFIRMAR: "#d9730d",
};
