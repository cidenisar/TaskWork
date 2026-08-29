// Servidor HTTP mínimo para los canales de Mobile y Frontend Web — ver
// README, "Endpoint para las confirmaciones de Mobile" / "Alta de
// operadores y login web para admins" / "Autoregistro de personas
// (Mobile)". Sin framework: el puñado de rutas que hay no lo justifica
// (mismo criterio que consola-simulador/, "no vale la pena traer algo
// más para esto").

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { MqttClient } from "mqtt";
import type { Db } from "./db.js";
import { manejarConfirmacion } from "../handlers/confirmaciones.js";
import { manejarCumplimiento } from "../handlers/cumplimiento.js";
import { manejarCrearOperador, manejarResetearPin } from "../handlers/operadores.js";
import { manejarReclamarPersona, manejarAutoregistro, manejarCanjearCodigo, manejarActualizarPushToken } from "../handlers/personas.js";
import { permitirIntento } from "./rateLimit.js";

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

interface ResultadoHandler {
  status: number;
  body: unknown;
}

// Ver README, "Precauciones al habilitar Anonymous Sign-ins" —
// `signInAnonymously()` le da a cualquiera un JWT válido gratis, sin
// verificación de ningún tipo. Sin límite de intentos, los tres
// endpoints de autoregistro quedaban con la única protección de
// "adiviná legajo+DNI o el código" y listo. Por IP, sin proxy inverso
// delante en este entorno — la dirección del socket es la real, el
// cliente no la puede falsear. Si algún día hay un balanceador/proxy
// delante, esto tiene que pasar a confiar en `X-Forwarded-For` SOLO
// del proxy conocido, nunca en lo que mande el cliente directo.
function obtenerIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "desconocida";
}

/** `true` si hay cupo (y lo consume); si no, ya respondió 429 y el caller debe cortar ahí. */
function limitarPorIp(req: IncomingMessage, res: ServerResponse, ruta: string, maxIntentos: number, ventanaMs: number): boolean {
  const clave = `ip:${ruta}:${obtenerIp(req)}`;
  if (permitirIntento(clave, maxIntentos, ventanaMs)) return true;
  responderJson(res, 429, { error: "demasiados intentos — esperá un rato antes de volver a probar" });
  return false;
}

/**
 * Lee+parsea el body de `req` y se lo pasa a `manejador` — mismo
 * camino (límite de tamaño, JSON inválido, error interno) para las 5
 * rutas POST-con-body de este servidor, para no repetirlo 5 veces.
 * `etiquetaRuta` es solo para el log de error.
 */
async function manejarPostConBody(
  req: IncomingMessage,
  res: ServerResponse,
  etiquetaRuta: string,
  manejador: (body: unknown) => Promise<ResultadoHandler>
): Promise<void> {
  try {
    let raw: string;
    try {
      raw = await leerBody(req);
    } catch (err) {
      if (err instanceof BodyDemasiadoGrandeError) {
        // Responder primero, cortar recién después — destruir el socket
        // antes de escribir la respuesta manda la conexión vacía en vez
        // del 413 (probado: así fallaba).
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
    const resultado = await manejador(body);
    responderJson(res, resultado.status, resultado.body);
  } catch (err) {
    console.error(`[http] error procesando ${etiquetaRuta}:`, err);
    responderJson(res, 500, { error: "error interno" });
  }
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
    const auth = req.headers.authorization;

    if (req.method === "POST" && url.pathname === "/confirmaciones") {
      void manejarPostConBody(req, res, "POST /confirmaciones", (body) => manejarConfirmacion(db, mqttClient, auth, body));
      return;
    }

    if (req.method === "GET" && url.pathname === "/simulacros/cumplimiento") {
      void (async () => {
        try {
          const sitioId = url.searchParams.get("sitioId");
          const resultado = await manejarCumplimiento(db, auth, sitioId);
          responderJson(res, resultado.status, resultado.body);
        } catch (err) {
          console.error("[http] error procesando GET /simulacros/cumplimiento:", err);
          responderJson(res, 500, { error: "error interno" });
        }
      })();
      return;
    }

    if (req.method === "POST" && url.pathname === "/operadores") {
      void manejarPostConBody(req, res, "POST /operadores", (body) => manejarCrearOperador(db, auth, body));
      return;
    }

    // /operadores/{id}/resetear-pin — único path con parámetro de este
    // servidor; no justifica un router entero por eso (mismo criterio de
    // "sin framework" del resto del archivo). Sin body, así que no pasa
    // por manejarPostConBody.
    const resetearPinMatch = /^\/operadores\/([^/]+)\/resetear-pin$/.exec(url.pathname);
    if (req.method === "POST" && resetearPinMatch) {
      const operadorId = resetearPinMatch[1];
      void (async () => {
        try {
          const resultado = await manejarResetearPin(db, auth, operadorId);
          responderJson(res, resultado.status, resultado.body);
        } catch (err) {
          console.error("[http] error procesando POST /operadores/:id/resetear-pin:", err);
          responderJson(res, 500, { error: "error interno" });
        }
      })();
      return;
    }

    if (req.method === "POST" && url.pathname === "/personas/reclamar") {
      // 20 intentos / 15 min por IP — generoso para tolerar varias
      // personas reclamando desde la misma IP compartida (wifi del
      // sitio, NAT corporativo) el día que arranca el autoregistro,
      // pero corta un script insistiendo. Ver también el límite por
      // legajo+DNI puntual dentro del handler.
      if (!limitarPorIp(req, res, "personas-reclamar", 20, 15 * 60_000)) return;
      void manejarPostConBody(req, res, "POST /personas/reclamar", (body) => manejarReclamarPersona(db, auth, body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/personas/autoregistro") {
      if (!limitarPorIp(req, res, "personas-autoregistro", 10, 60 * 60_000)) return;
      void manejarPostConBody(req, res, "POST /personas/autoregistro", (body) => manejarAutoregistro(db, auth, body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/personas/canjear-codigo") {
      if (!limitarPorIp(req, res, "personas-canjear-codigo", 20, 15 * 60_000)) return;
      void manejarPostConBody(req, res, "POST /personas/canjear-codigo", (body) => manejarCanjearCodigo(db, auth, body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/personas/push-token") {
      void manejarPostConBody(req, res, "POST /personas/push-token", (body) => manejarActualizarPushToken(db, auth, body));
      return;
    }

    responderJson(res, 404, { error: "no encontrado" });
  });
}
