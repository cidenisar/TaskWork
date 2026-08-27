// Servidor HTTP mínimo para el canal de Mobile — ver README, "Endpoint para
// las confirmaciones de Mobile" (REST, no MQTT). Sin framework: un solo
// endpoint no lo justifica (mismo criterio que consola-simulador/, "no vale
// la pena traer algo más para esto").

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { MqttClient } from "mqtt";
import type { Db } from "./db.js";
import { manejarConfirmacion } from "../handlers/confirmaciones.js";

function leerBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
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
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/confirmaciones") {
      void (async () => {
        try {
          const raw = await leerBody(req);
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

    responderJson(res, 404, { error: "no encontrado" });
  });
}
