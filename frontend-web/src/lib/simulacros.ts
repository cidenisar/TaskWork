// Capa de datos de "Historial de cumplimiento" — ver
// backend-server/README.md ("Vista de cumplimiento") y
// src/logic/cumplimiento.ts del backend para la forma exacta. A
// diferencia de Operadores/Pendientes, esto pasa por backend-server
// (no lectura directa) porque la granularidad real (por (sitio, tipo de
// evento), no un log fila por fila de cada ocurrencia pasada) es una
// agregación que ya calcula el backend — replicarla acá sería
// duplicar `logic/cumplimiento.ts` en el cliente.

import { llamarBackend } from "./backend";

export interface EstadoCumplimiento {
  sitioId: string;
  sitioNombre: string;
  tipoEventoId: string;
  tipoEventoNombre: string;
  ultimoResuelto: { fechaHora: string; estado: "realizado" | "no_realizado" } | null;
  proximoProgramado: string | null;
  alDia: boolean;
}

export async function obtenerCumplimiento(): Promise<EstadoCumplimiento[]> {
  const r = await llamarBackend<EstadoCumplimiento[]>("/simulacros/cumplimiento", { method: "GET" });
  if (r.status !== 200 || !Array.isArray(r.body)) {
    const error = !Array.isArray(r.body) && "error" in r.body ? r.body.error : "Error inesperado cargando el cumplimiento.";
    throw new Error(error);
  }
  return r.body;
}
