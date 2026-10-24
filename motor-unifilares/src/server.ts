/**
 * Servicio HTTP mínimo (sin framework, mismo criterio que backend-server/):
 *   POST /api/unifilar                  — encola el pedido de un plano (ver README.md "Generación asincrónica"); no genera nada acá.
 *   GET  /                              — interfaz web para enseñar casos puntuales (public/index.html).
 *
 * Este server.ts es SOLO para desarrollo local (npm run dev/start) — el
 * despliegue real corre en Vercel como funciones sueltas bajo api/ (ver
 * esa carpeta), que llaman exactamente a los mismos módulos de src/. Si
 * cambiás una validación o un contrato acá, replicalo en el api/*.ts
 * correspondiente (y viceversa) — son dos adaptadores HTTP finitos sobre
 * el mismo núcleo, no una sola fuente de verdad.
 *   GET  /api/ejemplos                  — lista los ejemplos ya enseñados.
 *   POST /api/ejemplos/previsualizar    — imagen+explicación → Ejemplo propuesto + PDF de previsualización (sin guardar).
 *   POST /api/ejemplos                  — guarda un ejemplo ya revisado.
 *   DELETE /api/ejemplos/:tag           — borra un ejemplo.
 * Nunca sube nada a storage — eso lo hace scripts/procesar-cola.ts (el
 * worker que de verdad genera y sube el unifilar, ver README.md).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { validarDrawCommand } from "./anthropic-client.js";
import { generarEjemploDesdeImagen, RespuestaEnsenarInvalida, type MediaTypeImagen } from "./ensenar.js";
import { listarEjemplos, guardarEjemplo, eliminarEjemplo } from "./ejemplos-store.js";
import { encolarJob } from "./jobs-store.js";
import { drawCommandsToPdfFragment } from "./pdf-renderer.js";
import { calcularDimensiones } from "./geometria.js";
import type { DrawCommand, PedidoUnifilar } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGINA_ENSENAR = readFileSync(join(__dirname, "..", "public", "index.html"), "utf-8");

const PORT = Number(process.env.PORT) || 8787;
const MAX_BODY_BYTES = 20 * 1024 * 1024; // una foto en base64 pesa ~33% más que el archivo — 20MB da margen para fotos de celular normales

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

function apiKeyDelHeader(req: IncomingMessage, res: ServerResponse): string | null {
  const apiKey = req.headers["x-anthropic-api-key"];
  if (typeof apiKey !== "string" || !apiKey) {
    responderJson(res, 401, { error: "Falta el header X-Anthropic-Api-Key — este servicio usa la clave de quien llama, no tiene una propia." });
    return null;
  }
  return apiKey;
}

async function manejarGenerarUnifilar(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  if (!pedido?.medicionId || !Array.isArray(pedido.circuitos) || pedido.circuitos.length === 0 || !pedido.rotulo) {
    responderJson(res, 400, { error: 'El pedido necesita "medicionId", "circuitos" (array no vacío) y "rotulo".' });
    return;
  }

  try {
    const jobId = await encolarJob(pedido);
    responderJson(res, 202, { jobId });
  } catch (err) {
    console.error("[motor-unifilares] error encolando el pedido:", err);
    responderJson(res, 500, { error: "No se pudo encolar el pedido." });
  }
}

async function manejarListarEjemplos(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const ejemplos = await listarEjemplos();
    responderJson(res, 200, { ejemplos });
  } catch (err) {
    console.error("[motor-unifilares] error listando ejemplos:", err);
    responderJson(res, 500, { error: err instanceof Error ? err.message : "Error inesperado listando ejemplos." });
  }
}

const MEDIA_TYPES_VALIDOS = new Set<string>(["image/jpeg", "image/png", "image/webp"]);

async function manejarPrevisualizarEjemplo(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const apiKey = apiKeyDelHeader(req, res);
  if (!apiKey) return;

  let bodyRaw: string;
  try {
    bodyRaw = await leerBody(req);
  } catch {
    responderJson(res, 413, { error: "La imagen es demasiado grande." });
    return;
  }

  let pedido: { imagenBase64?: unknown; mediaType?: unknown; explicacion?: unknown; tag?: unknown };
  try {
    pedido = JSON.parse(bodyRaw);
  } catch {
    responderJson(res, 400, { error: "El cuerpo no es JSON válido." });
    return;
  }
  if (typeof pedido.imagenBase64 !== "string" || !pedido.imagenBase64) {
    responderJson(res, 400, { error: 'Falta "imagenBase64".' });
    return;
  }
  if (typeof pedido.mediaType !== "string" || !MEDIA_TYPES_VALIDOS.has(pedido.mediaType)) {
    responderJson(res, 400, { error: 'Falta o es inválido "mediaType" (image/jpeg, image/png o image/webp).' });
    return;
  }
  if (typeof pedido.explicacion !== "string" || !pedido.explicacion.trim()) {
    responderJson(res, 400, { error: 'Falta "explicacion".' });
    return;
  }
  const tagForzado = typeof pedido.tag === "string" && pedido.tag.trim() ? pedido.tag.trim() : undefined;

  try {
    const ejemplo = await generarEjemploDesdeImagen(apiKey, pedido.imagenBase64, pedido.mediaType as MediaTypeImagen, pedido.explicacion, tagForzado);
    const { width, height } = calcularDimensiones(ejemplo.commands);
    const pdfBuffer = await drawCommandsToPdfFragment(ejemplo.commands, width, height);
    responderJson(res, 200, { ejemplo, pdfBase64: pdfBuffer.toString("base64") });
  } catch (err) {
    if (err instanceof RespuestaEnsenarInvalida) {
      responderJson(res, 502, { error: `La IA no devolvió un ejemplo utilizable: ${err.message}` });
      return;
    }
    if (err instanceof Anthropic.APIError) {
      responderJson(res, 502, { error: `Error de la API de Anthropic: ${err.message}` });
      return;
    }
    console.error("[motor-unifilares] error previsualizando ejemplo:", err);
    responderJson(res, 500, { error: "Error inesperado generando la previsualización." });
  }
}

function validarEjemploCompleto(o: Record<string, unknown>): boolean {
  if (typeof o.tag !== "string" || !/^[a-z0-9_]+$/.test(o.tag)) return false;
  if (typeof o.cuandoAplica !== "string" || !o.cuandoAplica.trim()) return false;
  if (!Array.isArray(o.commands) || o.commands.length === 0) return false;
  return o.commands.every((c) => validarDrawCommand(c));
}

async function manejarGuardarEjemplo(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let bodyRaw: string;
  try {
    bodyRaw = await leerBody(req);
  } catch {
    responderJson(res, 413, { error: "El cuerpo es demasiado grande." });
    return;
  }

  let pedido: Record<string, unknown>;
  try {
    pedido = JSON.parse(bodyRaw);
  } catch {
    responderJson(res, 400, { error: "El cuerpo no es JSON válido." });
    return;
  }
  if (!validarEjemploCompleto(pedido)) {
    responderJson(res, 400, { error: 'Forma inválida — se espera {"tag","cuandoAplica","commands"} con comandos válidos.' });
    return;
  }

  try {
    await guardarEjemplo({ tag: pedido.tag as string, cuandoAplica: pedido.cuandoAplica as string, commands: pedido.commands as DrawCommand[] });
    responderJson(res, 200, { ok: true });
  } catch (err) {
    console.error("[motor-unifilares] error guardando ejemplo:", err);
    responderJson(res, 500, { error: err instanceof Error ? err.message : "Error inesperado guardando el ejemplo." });
  }
}

async function manejarEliminarEjemplo(tag: string, res: ServerResponse): Promise<void> {
  try {
    await eliminarEjemplo(tag);
    responderJson(res, 200, { ok: true });
  } catch (err) {
    console.error("[motor-unifilares] error eliminando ejemplo:", err);
    responderJson(res, 500, { error: err instanceof Error ? err.message : "Error inesperado eliminando el ejemplo." });
  }
}

const server = createServer((req, res) => {
  const url = req.url ?? "/";

  if (req.method === "GET" && url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGINA_ENSENAR);
    return;
  }
  if (req.method === "GET" && url === "/health") {
    responderJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && url === "/api/unifilar") {
    manejarGenerarUnifilar(req, res).catch((err) => {
      console.error("[motor-unifilares] error no manejado:", err);
      responderJson(res, 500, { error: "Error inesperado." });
    });
    return;
  }
  if (req.method === "GET" && url === "/api/ejemplos") {
    manejarListarEjemplos(req, res).catch((err) => {
      console.error("[motor-unifilares] error no manejado:", err);
      responderJson(res, 500, { error: "Error inesperado." });
    });
    return;
  }
  if (req.method === "POST" && url === "/api/ejemplos/previsualizar") {
    manejarPrevisualizarEjemplo(req, res).catch((err) => {
      console.error("[motor-unifilares] error no manejado:", err);
      responderJson(res, 500, { error: "Error inesperado." });
    });
    return;
  }
  if (req.method === "POST" && url === "/api/ejemplos") {
    manejarGuardarEjemplo(req, res).catch((err) => {
      console.error("[motor-unifilares] error no manejado:", err);
      responderJson(res, 500, { error: "Error inesperado." });
    });
    return;
  }
  if (req.method === "DELETE" && url.startsWith("/api/ejemplos/")) {
    const tag = decodeURIComponent(url.slice("/api/ejemplos/".length));
    manejarEliminarEjemplo(tag, res).catch((err) => {
      console.error("[motor-unifilares] error no manejado:", err);
      responderJson(res, 500, { error: "Error inesperado." });
    });
    return;
  }
  responderJson(res, 404, { error: "Ruta no encontrada." });
});

server.listen(PORT, () => {
  console.log(`[motor-unifilares] escuchando en :${PORT}`);
});
