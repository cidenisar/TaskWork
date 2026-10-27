/**
 * POST /api/probar/estructura — mismo contrato que server.ts local. Nunca
 * llama a la IA (ver src/estructura-prueba.ts).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { calcularEstructuraPrevia, validarCircuitosPrueba } from "../../src/estructura-prueba.js";
import type { UnifilarCircuito } from "../../src/types.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const pedido = (req.body ?? {}) as { circuitos?: unknown };
  const errorForma = validarCircuitosPrueba(pedido.circuitos);
  if (errorForma) {
    res.status(400).json({ error: errorForma });
    return;
  }

  res.status(200).json({ estructura: calcularEstructuraPrevia(pedido.circuitos as UnifilarCircuito[]) });
}
