// Servidor HTTP mínimo para el canal de Mobile — ver README, "Endpoint para
// las confirmaciones de Mobile" (REST, no MQTT). Sin framework: un solo
// endpoint no lo justifica (mismo criterio que consola-simulador/, "no vale
// la pena traer algo más para esto").

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { MqttClient } from "mqtt";
import type { Db } from "./db.js";
import { manejarConfirmacion } from "../handlers/confirmaciones.js";
import { manejarCumplimiento } from "../handlers/cumplimiento.js";

// De sobra para el body más grande que maneja este servidor (una
// confirmación, con `notaAyuda` de texto libre incluido) — sin esto,
// `leerBody` bufferea cualquier tamaño en memoria antes de siquiera
// intentar parsear el JSON.
const MAX_BODY_BYTES = 64 * 1024;

class BodyDemasiadoGrandeError extends Error {}

function leerBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    let rechazado = false;
    req.on("data", (chunk: Buffer) => {
      if (rechazado) return; // ya se rechazó — seguir descartando sin acumular, no destruir el socket todavía
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        rechazado = true;
        reject(new BodyDemasiadoGrandeError());
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!rechazado) resolve(data);
    });
    req.on("error", reject);
  });
}

function responderJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    // El origin abierto es solo para no bloquear al cliente por CORS — la
    // seguridad real la hace el JWT de Authorization, no esto.
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

export function crearServidorHttp(db: Db, mqttClient: MqttClient): Server {
  return createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    // Parseado una sola vez acá — `pathname` es lo que se compara en cada
    // ruta (nunca `req.url` crudo, que trae el query string pegado y haría
    // que un `startsWith` matchee de más — ver README, hallazgo de code review).
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "POST" && url.pathname === "/confirmaciones") {
      void (async () => {
        try {
          let raw: string;
          try {
            raw = await leerBody(req);
          } catch (err) {
            if (err instanceof BodyDemasiadoGrandeError) {
              // Responder primero, cortar recién después — destruir el
              // socket antes de escribir la respuesta manda la conexión
              // vacía en vez del 413 (probado: así fallaba).
              responderJson(res, 413, { error: "body demasiado grande" });
              req.destroy();
              return;
            }
            throw err;
          }
          let body: unknown;
          try {
            body = raw.length > 0 ? JSON.parse(raw) : {};
          } catch {
            responderJson(res, 400, { error: "body no es JSON válido" });
            return;
          }
          const resultado = await manejarConfirmacion(db, mqttClient, req.headers.authorization, body);
          responderJson(res, resultado.status, resultado.body);
        } catch (err) {
          console.error("[http] error procesando POST /confirmaciones:", err);
          responderJson(res, 500, { error: "error interno" });
        }
      })();
      return;
    }

    if (req.method === "GET" && url.pathname === "/simulacros/cumplimiento") {
      void (async () => {
        try {
          const sitioId = url.searchParams.get("sitioId");
          const resultado = await manejarCumplimiento(db, req.headers.authorization, sitioId);
          responderJson(res, resultado.status, resultado.body);
        } catch (err) {
          console.error("[http] error procesando GET /simulacros/cumplimiento:", err);
          responderJson(res, 500, { error: "error interno" });
        }
      })();
      return;
    }

    responderJson(res, 404, { error: "no encontrado" });
  });
}
