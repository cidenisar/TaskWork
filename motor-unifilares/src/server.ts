/**
 * Servicio HTTP mínimo (sin framework, mismo criterio que backend-server/):
 * un único endpoint, POST /api/unifilar, que recibe los circuitos de un
 * tablero + el rótulo, le pide a Claude que arme el plano siguiendo
 * REGLAS_UNIFILAR.md, y devuelve el DXF (el PDF se suma en un paso
 * aparte). Nunca sube nada a storage — eso lo hace quien llama (ver
 * README.md).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { generarUnifilar, RespuestaIaInvalida } from "./anthropic-client.js";
import { drawCommandsToDxf } from "./dxf-writer.js";
import { drawCommandsToPdf } from "./pdf-renderer.js";
import type { PedidoUnifilar, RespuestaUnifilar } from "./types.js";

const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB alcanza de sobra para un JSON de circuitos

function leerBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error("body-demasiado-grande"));
        req.destroy();
        return;
      }
      data += chunk.toString("utf-8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function responderJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(json) });
  res.end(json);
}

async function manejarGenerarUnifilar(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const apiKey = req.headers["x-anthropic-api-key"];
  if (typeof apiKey !== "string" || !apiKey) {
    responderJson(res, 401, { error: "Falta el header X-Anthropic-Api-Key — este servicio usa la clave de quien llama, no tiene una propia." });
    return;
  }

  let bodyRaw: string;
  try {
    bodyRaw = await leerBody(req);
  } catch {
    responderJson(res, 413, { error: "El cuerpo del pedido es demasiado grande." });
    return;
  }

  let pedido: PedidoUnifilar;
  try {
    pedido = JSON.parse(bodyRaw);
  } catch {
    responderJson(res, 400, { error: "El cuerpo no es JSON válido." });
    return;
  }
  if (!Array.isArray(pedido?.circuitos) || pedido.circuitos.length === 0 || !pedido.rotulo) {
    responderJson(res, 400, { error: 'El pedido necesita "circuitos" (array no vacío) y "rotulo".' });
    return;
  }

  try {
    const dibujo = await generarUnifilar(apiKey, pedido.circuitos, pedido.rotulo);
    const dxfBuffer = drawCommandsToDxf(dibujo.commands, dibujo.height);
    const pdfBuffer = await drawCommandsToPdf(dibujo.commands, dibujo.width, dibujo.height);
    const respuesta: RespuestaUnifilar = { dxfBase64: dxfBuffer.toString("base64"), pdfBase64: pdfBuffer.toString("base64") };
    responderJson(res, 200, respuesta);
  } catch (err) {
    if (err instanceof RespuestaIaInvalida) {
      responderJson(res, 502, { error: `La IA no devolvió un plano utilizable: ${err.message}` });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      responderJson(res, 502, { error: `Error de la API de Anthropic: ${err.message}` });
      return;
    }
    console.error("[motor-unifilares] error inesperado:", err);
    responderJson(res, 500, { error: "Error inesperado generando el unifilar." });
  }
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/unifilar") {
    manejarGenerarUnifilar(req, res).catch((err) => {
      console.error("[motor-unifilares] error no manejado:", err);
      responderJson(res, 500, { error: "Error inesperado." });
    });
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    responderJson(res, 200, { ok: true });
    return;
  }
  responderJson(res, 404, { error: "Ruta no encontrada." });
});

server.listen(PORT, () => {
  console.log(`[motor-unifilares] escuchando en :${PORT}`);
});
