/**
 * POST /api/probar/generar — mismo contrato que server.ts local. A
 * diferencia de /api/unifilar (que solo encola), esto genera DE VERDAD y
 * en el momento — por eso el tope de LIMITE_CIRCUITOS_SINCRONICO (sigue
 * atado al maxDuration: 60 de la función, ver vercel.json) y por eso
 * nunca guarda nada: es una previsualización para iterar con fixtures
 * chicos (ver src/fixtures-prueba.ts), no un pedido real de un tablero.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";
import { generarUnifilar, estimarCostoUsd, RespuestaIaInvalida } from "../../src/anthropic-client.js";
import { drawCommandsToPdf } from "../../src/pdf-renderer.js";
import { validarCircuitosPrueba } from "../../src/estructura-prueba.js";
import { ROTULO_PRUEBA } from "../../src/fixtures-prueba.js";
import type { RotuloUnifilar, UnifilarCircuito } from "../../src/types.js";

const LIMITE_CIRCUITOS_SINCRONICO = 15;

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

  const pedido = (req.body ?? {}) as { circuitos?: unknown; rotulo?: unknown };
  const errorForma = validarCircuitosPrueba(pedido.circuitos);
  if (errorForma) {
    res.status(400).json({ error: errorForma });
    return;
  }
  const circuitos = pedido.circuitos as UnifilarCircuito[];
  if (circuitos.length > LIMITE_CIRCUITOS_SINCRONICO) {
    res.status(400).json({
      error:
        `Esta previsualización es solo para tableros chicos (máx. ${LIMITE_CIRCUITOS_SINCRONICO} circuitos) — ` +
        `tiene ${circuitos.length}. Para un tablero real completo, usá el botón "Generar unifilar" de informes-app (cola + worker).`,
    });
    return;
  }
  const rotulo = (pedido.rotulo && typeof pedido.rotulo === "object" ? pedido.rotulo : ROTULO_PRUEBA) as RotuloUnifilar;

  try {
    const { drawing, uso } = await generarUnifilar(apiKey, circuitos, rotulo);
    const pdfBuffer = await drawCommandsToPdf(drawing.commands, drawing.width, drawing.height);
    res.status(200).json({ pdfBase64: pdfBuffer.toString("base64"), uso, costoUsd: estimarCostoUsd(uso) });
  } catch (err) {
    if (err instanceof RespuestaIaInvalida) {
      res.status(502).json({ error: `La IA no devolvió un plano utilizable: ${err.message}` });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: `Error de la API de Anthropic: ${err.message}` });
      return;
    }
    console.error("[motor-unifilares] error generando previsualización de prueba:", err);
    res.status(500).json({ error: "Error inesperado generando la previsualización." });
  }
}
