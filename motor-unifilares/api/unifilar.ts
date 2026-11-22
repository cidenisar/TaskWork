/**
 * Función Vercel equivalente a POST /api/unifilar del server.ts local (ver
 * ese archivo para el detalle del contrato) — mismo núcleo de src/, solo
 * cambia el adaptador HTTP (Vercel entrega req/res ya parseados, no hace
 * falta leer el body a mano).
 *
 * Este endpoint solo ENCOLA el pedido (ver README.md "Generación
 * asincrónica" y src/jobs-store.ts) — no llama a la IA ni arma PDF/DXF acá,
 * así que no necesita X-Anthropic-Api-Key: ese llamado lo hace
 * scripts/procesar-cola.ts, con su propia ANTHROPIC_API_KEY de entorno,
 * fuera de cualquier función serverless con límite de tiempo.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { encolarJob } from "../src/jobs-store.js";
import type { PedidoUnifilar } from "../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const pedido = req.body as PedidoUnifilar | undefined;
  if (!pedido?.medicionId || !Array.isArray(pedido.circuitos) || pedido.circuitos.length === 0 || !pedido.rotulo) {
    res.status(400).json({ error: 'El pedido necesita "medicionId", "circuitos" (array no vacío) y "rotulo".' });
    return;
  }

  try {
    const jobId = await encolarJob(pedido);
    res.status(202).json({ jobId });
  } catch (err) {
    console.error("[motor-unifilares] error encolando el pedido:", err);
    res.status(500).json({ error: "No se pudo encolar el pedido." });
  }
}
