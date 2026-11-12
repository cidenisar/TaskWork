/**
 * GET /api/probar/fixtures — mismo contrato que server.ts local.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FIXTURES_PRUEBA, ROTULO_PRUEBA } from "../../src/fixtures-prueba.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }
  res.status(200).json({ fixtures: FIXTURES_PRUEBA, rotulo: ROTULO_PRUEBA });
}
