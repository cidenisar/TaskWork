// Validación de PIN — pura salvo por bcrypt.compare, que es determinística
// y sin I/O de red/disco (no cuenta como el tipo de I/O que este proyecto
// separa en lib/) — así que esto se testea con node:test como cualquier
// otra lógica de negocio, sin mockear nada. Ver backend-server/README,
// "Autenticación de las consolas contra Mosquitto"/PIN: "la consola
// valida, el backend solo audita" — esta es esa validación.

import bcrypt from "bcryptjs";
import type { OperadorPadron } from "../types.js";

export interface ResultadoValidacionPin {
  resultado: "valido" | "invalido";
  operadorId: string | null;
  legajo: string | null;
  rol: "operador" | "admin" | null;
}

/**
 * Prueba el PIN contra el hash de CADA operador del padrón cacheado hasta
 * encontrar uno que matchee — no hay "usuario" que el operador tipee
 * primero, solo un PIN (ver contrato de la consola física: es lo que
 * permite que cualquier operador habilitado use cualquier consola sin
 * loguearse antes). Con el padrón típico (decenas de operadores, no
 * miles), probar uno por uno alcanza de sobra.
 */
export async function validarPin(pin: string, operadores: OperadorPadron[]): Promise<ResultadoValidacionPin> {
  for (const operador of operadores) {
    const matchea = await bcrypt.compare(pin, operador.pinHash);
    if (matchea) {
      return { resultado: "valido", operadorId: operador.id, legajo: operador.legajo, rol: operador.rol };
    }
  }
  return { resultado: "invalido", operadorId: null, legajo: null, rol: null };
}
