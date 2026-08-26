// Auditoría de validación de PIN — pura.
//
// Ver 05.3-programacion.md: la validación del PIN pasa siempre en la propia
// consola (contra su copia local del padrón, para que funcione sin
// conexión) — Backend Online NO valida nada acá, solo recibe el resultado
// que ya decidió la Pi y lo deja en el historial/auditoría.

import type { PayloadAuthMqtt } from "../types.js";

export interface RegistroAuditoriaPin {
  operador_id: string | null;
  consola_id: string;
  resultado: "valido" | "invalido";
}

export class PayloadAuthInconsistente extends Error {}

/**
 * Valida la consistencia interna del payload antes de escribir el registro:
 * un resultado "valido" sin operadorId es un payload roto (la Pi no debería
 * poder mandar esa combinación) — se rechaza en vez de guardar un dato que
 * no se puede auditar correctamente.
 */
export function construirRegistroAuditoria(payload: PayloadAuthMqtt, consolaId: string): RegistroAuditoriaPin {
  if (payload.resultado === "valido" && !payload.operadorId) {
    throw new PayloadAuthInconsistente(
      `Payload de auth con resultado "valido" pero sin operadorId (consola ${consolaId})`
    );
  }
  return {
    operador_id: payload.operadorId,
    consola_id: consolaId,
    resultado: payload.resultado,
  };
}
