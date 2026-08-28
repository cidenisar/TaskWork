// Servidor de la pantalla táctil — sirve el HTML (src/pantalla/index.html,
// adaptado del wireframe "Consola Disparador" de Cowork) y lo mantiene al
// día con Server-Sent Events, sin framework ni dependencias nuevas (mismo
// criterio que backend-server/lib/http.ts: un puñado de rutas no
// justifica traer algo más). Pensado para Chromium en modo kiosco contra
// http://localhost:PUERTO en la propia Pi.
//
// Invariante 1 de la Especificación ("la pantalla nunca dispara una
// emergencia real") se respeta acá al pie de la letra: la única entrada
// que este servidor acepta desde la pantalla es el PIN (`POST /pin`) y
// CANCELAR (`POST /cancelar`, ver invariante 3 — nunca toca MQTT). No hay
// ninguna ruta que publique un evento DISPARADO; eso solo puede pasar
// desde el lado del ESP32 (ver index.ts).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { EstadoPanel } from "../logic/panel.js";
import type { PayloadEventoActivoMqtt, PayloadAccountabilityMqtt, PayloadSimulacroMqtt } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(path.join(__dirname, "../pantalla/index.html"), "utf8");

export interface EstadoParaPantalla {
  panel: EstadoPanel;
  modo: "REAL" | "SIMULACRO";
  releActivo: boolean;
  padronCount: number;
  eventoActivo: PayloadEventoActivoMqtt | null;
  accountability: PayloadAccountabilityMqtt | null;
  simulacro: PayloadSimulacroMqtt | null;
  esp32HeartbeatOk: boolean;
  /** epoch ms — cuándo termina la cuenta regresiva actual, si `panel.fase === "confirmando"`. */
  cuentaRegresivaFinTs: number | null;
}

export interface ServidorPantalla {
  server: Server;
  /** Llamar cada vez que cambie algo relevante — empuja el estado nuevo a todas las pantallas conectadas. */
  notificar(): void;
}

function leerBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function responderJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function crearServidorPantalla(opts: {
  obtenerEstado: () => EstadoParaPantalla;
  onPin: (pin: string) => Promise<{ resultado: "valido" | "invalido" }>;
  onCancelar: () => void;
}): ServidorPantalla {
  const clientesSse = new Set<ServerResponse>();

  function notificar(): void {
    const linea = `data: ${JSON.stringify(opts.obtenerEstado())}\n\n`;
    for (const res of clientesSse) res.write(linea);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }

    if (req.method === "GET" && url.pathname === "/eventos") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(opts.obtenerEstado())}\n\n`); // estado inicial, no esperar al próximo cambio
      clientesSse.add(res);
      req.on("close", () => clientesSse.delete(res));
      return;
    }

    if (req.method === "POST" && url.pathname === "/pin") {
      void (async () => {
        try {
          const body = JSON.parse(await leerBody(req)) as { pin?: unknown };
          if (typeof body.pin !== "string") {
            responderJson(res, 400, { error: "falta pin (string)" });
            return;
          }
          const resultado = await opts.onPin(body.pin);
          responderJson(res, 200, resultado);
        } catch (err) {
          console.error("[pantalla] error procesando POST /pin:", err);
          responderJson(res, 500, { error: "error interno" });
        }
      })();
      return;
    }

    if (req.method === "POST" && url.pathname === "/cancelar") {
      opts.onCancelar();
      responderJson(res, 200, { ok: true });
      return;
    }

    responderJson(res, 404, { error: "no encontrado" });
  });

  return { server, notificar };
}
