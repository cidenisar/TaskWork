/**
 * POST /api/simbolos/previsualizar — mismo contrato que server.ts local.
 * A diferencia de /api/ejemplos/previsualizar, esto NUNCA llama a la IA
 * (lectura directa del DXF) — no pide X-Anthropic-Api-Key.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extraerBloquesDesdeDxf } from "../../src/dxf-import.js";
import { drawCommandsToPdfFragment } from "../../src/pdf-renderer.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido." });
    return;
  }

  const pedido = (req.body ?? {}) as { dxfBase64?: unknown };
  if (typeof pedido.dxfBase64 !== "string" || !pedido.dxfBase64) {
    res.status(400).json({ error: 'Falta "dxfBase64".' });
    return;
  }

  let dxfTexto: string;
  try {
    dxfTexto = Buffer.from(pedido.dxfBase64, "base64").toString("utf-8");
  } catch {
    res.status(400).json({ error: "No se pudo decodificar el archivo." });
    return;
  }

  try {
    const { bloques, fallidos } = extraerBloquesDesdeDxf(dxfTexto);
    const bloquesConPreview = await Promise.all(
      bloques.map(async (b) => {
        const pdfBuffer = await drawCommandsToPdfFragment(b.commands, b.ancho + 20, b.alto + 20);
        return { ...b, pdfBase64: pdfBuffer.toString("base64") };
      }),
    );
    res.status(200).json({ bloques: bloquesConPreview, fallidos });
  } catch (err) {
    console.error("[motor-unifilares] error leyendo el DXF:", err);
    res.status(400).json({ error: err instanceof Error ? `No se pudo leer el DXF: ${err.message}` : "No se pudo leer el DXF." });
  }
}
