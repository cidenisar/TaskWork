// Punto de entrada — conecta a Supabase y al broker MQTT, y engancha cada
// tópico entrante con su handler. Ver README.md para cómo correr esto de
// verdad (necesita `npm install` en un entorno con acceso a internet, y las
// credenciales reales en `.env`).

import "dotenv/config";
import { crearClienteDb, Db } from "./lib/db.js";
import { conectar, suscribirEntrantes, idConsolaDeTopico } from "./lib/mqtt.js";
import { crearServidorHttp } from "./lib/http.js";
import { crearClientePush } from "./lib/push.js";
import { crearClienteSms } from "./lib/sms.js";
import { Despachador } from "./lib/despachador.js";
import { manejarEvento } from "./handlers/eventos.js";
import { manejarAuth } from "./handlers/auth.js";
import { manejarHeartbeat, manejarEstado } from "./handlers/estadoConsola.js";
import {
  marcarSimulacrosVencidosComoNoRealizados,
  sincronizarSimulacroDeTodosLosSitios,
} from "./handlers/simulacro.js";
import { sincronizarPadronDeTodosLosSitios } from "./handlers/padron.js";
import { sincronizarProgDeTodasLasConsolas } from "./handlers/prog.js";
import type {
  PayloadEventoMqtt,
  PayloadAuthMqtt,
  PayloadEstadoMqtt,
} from "./types.js";

const db = new Db(crearClienteDb());
const mqttClient = conectar();
// Un solo cliente de Firebase para todo el proceso — lo usa tanto el
// despacho de emergencias (Despachador) como el aviso de "tu autoregistro
// fue aprobado" (POST /personas/:id/aprobar, ver http.ts).
const pushApp = crearClientePush();
const despachador = new Despachador(pushApp, crearClienteSms());

const httpPort = Number(process.env.HTTP_PORT ?? 8090);
crearServidorHttp(db, mqttClient, pushApp).listen(httpPort, () => {
  console.log(`[http] escuchando en :${httpPort} — POST /confirmaciones (canal de Mobile)`);
});

mqttClient.on("connect", () => {
  console.log("[mqtt] conectado — suscribiendo tópicos entrantes");
  suscribirEntrantes(mqttClient);
});

mqttClient.on("error", (err) => {
  console.error("[mqtt] error de conexión:", err.message);
});

mqttClient.on("message", (topic, rawPayload) => {
  const parsed = idConsolaDeTopico(topic);
  if (!parsed) return;
  const { consolaId, resto } = parsed;

  void manejarMensaje(consolaId, resto, rawPayload.toString()).catch((err) => {
    console.error(`[mqtt] error procesando ${topic}:`, err);
  });
});

async function manejarMensaje(consolaId: string, resto: string, raw: string): Promise<void> {
  if (resto === "eventos") {
    const payload = JSON.parse(raw) as PayloadEventoMqtt;
    await manejarEvento(db, mqttClient, despachador, payload);
    return;
  }
  if (resto === "auth") {
    const payload = JSON.parse(raw) as PayloadAuthMqtt;
    await manejarAuth(db, consolaId, payload);
    return;
  }
  if (resto === "heartbeat") {
    await manejarHeartbeat(db, consolaId);
    return;
  }
  if (resto === "estado") {
    const payload = raw as PayloadEstadoMqtt; // "online" | "offline", texto plano
    await manejarEstado(db, consolaId, payload);
    return;
  }
}

// Chequeo periódico de simulacros vencidos (margen de 1h, ver
// logic/simulacro.ts) — 15 min de intervalo alcanza de sobra frente a un
// margen de una hora, sin recargar la base con chequeos constantes. Corre
// una vez ya al arrancar, para no esperar 15 min tras un restart antes de
// agarrar los que ya estaban vencidos.
const INTERVALO_CHEQUEO_SIMULACROS_MS = 15 * 60 * 1000;
function chequearSimulacrosVencidos(): void {
  void marcarSimulacrosVencidosComoNoRealizados(db, mqttClient).catch((err) => {
    console.error("[simulacros] error chequeando vencidos:", err);
  });
}
chequearSimulacrosVencidos();
setInterval(chequearSimulacrosVencidos, INTERVALO_CHEQUEO_SIMULACROS_MS);

// Re-sincronización de "próximo simulacro" (`consolas/{id}/simulacro`) de
// respaldo — el camino principal es el broadcast enganchado dentro de
// resolverSimulacroProgramado (handlers/simulacro.ts), que cubre el caso
// normal (se resolvió un simulacro). Este barrido es solo la red de
// seguridad para una edición directa en `simulacros_programados` que no
// pasó por ahí — mismo intervalo que el chequeo de vencidos, no hace
// falta algo más agresivo para un caso de borde.
function resincronizarSimulacros(): void {
  void sincronizarSimulacroDeTodosLosSitios(db, mqttClient).catch((err) => {
    console.error("[simulacros] error en la resincronización periódica:", err);
  });
}
resincronizarSimulacros();
setInterval(resincronizarSimulacros, INTERVALO_CHEQUEO_SIMULACROS_MS);

// Sincronización periódica del padrón hacia todas las consolas — decisión
// tomada (2026-08-27): cada 5 minutos, ver handlers/padron.ts. Corre una
// vez al arrancar, mismo criterio que el chequeo de simulacros: no esperar
// el intervalo completo tras un restart antes de que las consolas tengan
// el padrón al día.
const INTERVALO_SYNC_PADRON_MS = 5 * 60 * 1000;
function sincronizarPadron(): void {
  void sincronizarPadronDeTodosLosSitios(db, mqttClient).catch((err) => {
    console.error("[padron] error en la sincronización periódica:", err);
  });
}
sincronizarPadron();
setInterval(sincronizarPadron, INTERVALO_SYNC_PADRON_MS);

// Sincronización periódica de PROG1-4 (ver handlers/prog.ts) — mismo
// intervalo que el padrón: cambia con poca frecuencia (hoy ni siquiera
// hay una pantalla para editarlo, se completa a mano por SQL) y no hace
// falta algo más fino.
function sincronizarProg(): void {
  void sincronizarProgDeTodasLasConsolas(db, mqttClient).catch((err) => {
    console.error("[prog] error en la sincronización periódica:", err);
  });
}
sincronizarProg();
setInterval(sincronizarProg, INTERVALO_SYNC_PADRON_MS);

console.log("[backend-online] arrancando…");
