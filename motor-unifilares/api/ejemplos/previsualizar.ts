/**
 * POST /api/ejemplos/previsualizar — mismo contrato que server.ts local.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { generarEjemploDesdeImagen, RespuestaEnsenarInvalida, type MediaTypeImagen } from "../../src/ensenar.js";
import { drawCommandsToPdfFragment } from "../../src/pdf-renderer.js";
import { calcularDimensiones } from "../../src/geometria.js";

const MEDIA_TYPES_VALIDOS = new Set<string>(["image/jpeg", "image/png", "image/webp"]);

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

  const pedido = (req.body ?? {}) as { imagenBase64?: unknown; mediaType?: unknown; explicacion?: unknown; tag?: unknown };
  if (typeof pedido.imagenBase64 !== "string" || !pedido.imagenBase64) {
    res.status(400).json({ error: 'Falta "imagenBase64".' });
    return;
  }
  if (typeof pedido.mediaType !== "string" || !MEDIA_TYPES_VALIDOS.has(pedido.mediaType)) {
    res.status(400).json({ error: 'Falta o es inválido "mediaType" (image/jpeg, image/png o image/webp).' });
    return;
  }
  if (typeof pedido.explicacion !== "string" || !pedido.explicacion.trim()) {
    res.status(400).json({ error: 'Falta "explicacion".' });
    return;
  }
  const tagForzado = typeof pedido.tag === "string" && pedido.tag.trim() ? pedido.tag.trim() : undefined;

  try {
    const ejemplo = await generarEjemploDesdeImagen(apiKey, pedido.imagenBase64, pedido.mediaType as MediaTypeImagen, pedido.explicacion, tagForzado);
    const { width, height } = calcularDimensiones(ejemplo.commands);
    const pdfBuffer = await drawCommandsToPdfFragment(ejemplo.commands, width, height);
    res.status(200).json({ ejemplo, pdfBase64: pdfBuffer.toString("base64") });
  } catch (err) {
    if (err instanceof RespuestaEnsenarInvalida) {
      res.status(502).json({ error: `La IA no devolvió un ejemplo utilizable: ${err.message}` });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: `Error de la API de Anthropic: ${err.message}` });
      return;
    }
    console.error("[motor-unifilares] error previsualizando ejemplo:", err);
    res.status(500).json({ error: "Error inesperado generando la previsualización." });
  }
}
