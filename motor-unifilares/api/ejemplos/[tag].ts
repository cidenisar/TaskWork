/**
 * DELETE /api/ejemplos/:tag — mismo contrato que server.ts local.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eliminarEjemplo } from "../../src/ejemplos-store.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }
  const tag = req.query.tag;
  if (typeof tag !== "string") {
    res.status(400).json({ error: "Falta el tag." });
    return;
  }
  try {
    await eliminarEjemplo(tag);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[motor-unifilares] error eliminando ejemplo:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Error inesperado eliminando el ejemplo." });
  }
}
