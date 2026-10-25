/**
 * DELETE /api/simbolos/:nombre — mismo contrato que server.ts local.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eliminarSimbolo } from "../../src/simbolos-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }
  const nombre = req.query.nombre;
  if (typeof nombre !== "string") {
    res.status(400).json({ error: "Falta el nombre." });
    return;
  }
  try {
    await eliminarSimbolo(nombre);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[motor-unifilares] error eliminando símbolo:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Error inesperado eliminando el símbolo." });
  }
}
