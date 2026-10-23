/**
 * Función Vercel equivalente a POST /api/unifilar del server.ts local (ver
 * ese archivo para el detalle del contrato) — mismo núcleo de src/, solo
 * cambia el adaptador HTTP (Vercel entrega req/res ya parseados, no hace
 * falta leer el body a mano).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { generarUnifilar, RespuestaIaInvalida } from "../src/anthropic-client.js";
import { drawCommandsToDxf } from "../src/dxf-writer.js";
import { drawCommandsToPdf } from "../src/pdf-renderer.js";
import type { PedidoUnifilar, RespuestaUnifilar } from "../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const apiKey = req.headers["x-anthropic-api-key"];
  if (typeof apiKey !== "string" || !apiKey) {
    res.status(401).json({ error: "Falta el header X-Anthropic-Api-Key — este servicio usa la clave de quien llama, no tiene una propia." });
    return;
  }

  const pedido = req.body as PedidoUnifilar | undefined;
  if (!Array.isArray(pedido?.circuitos) || pedido.circuitos.length === 0 || !pedido.rotulo) {
    res.status(400).json({ error: 'El pedido necesita "circuitos" (array no vacío) y "rotulo".' });
    return;
  }

  try {
    const dibujo = await generarUnifilar(apiKey, pedido.circuitos, pedido.rotulo);
    const dxfBuffer = drawCommandsToDxf(dibujo.commands, dibujo.height);
    const pdfBuffer = await drawCommandsToPdf(dibujo.commands, dibujo.width, dibujo.height);
    const respuesta: RespuestaUnifilar = { dxfBase64: dxfBuffer.toString("base64"), pdfBase64: pdfBuffer.toString("base64") };
    res.status(200).json(respuesta);
  } catch (err) {
    if (err instanceof RespuestaIaInvalida) {
      res.status(502).json({ error: `La IA no devolvió un plano utilizable: ${err.message}` });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: `Error de la API de Anthropic: ${err.message}` });
      return;
    }
    console.error("[motor-unifilares] error inesperado:", err);
    res.status(500).json({ error: "Error inesperado generando el unifilar." });
  }
}
