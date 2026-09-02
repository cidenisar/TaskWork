// Broker MQTT local mínimo, SIN autenticación — para desarrollo/demo,
// nunca para producción (ver backend-server/README, "Autenticación de
// las consolas contra Mosquitto": esa autenticación real vive en
// Mosquitto + su plugin de dynamic-security, no acá). Este script existe
// para no depender de instalar/configurar Mosquitto a mano solo para
// probar sin hardware — un solo `npm install && node broker-local.mjs`
// alcanza en cualquier sistema con Node (Windows incluido, sin
// herramientas de compilación).
//
// Expone el broker en dos puertos:
//   - 1883 (TCP nativo) — para backend-server (mismo MQTT_URL de
//     siempre, mqtt://localhost:1883, ver backend-server/.env.example).
//   - 9001 (WebSocket) — para consola-virtual.html (y este mismo
//     index.html), que corren en un navegador y no pueden abrir un
//     socket TCP crudo.
//
// Validado de punta a punta (2026-08-30): backend-server conectado acá,
// un evento disparado desde consola-virtual.html llegó real a
// Supabase (fila en `eventos`, confirmaciones generadas).

import { createServer } from "node:net";
import { Aedes } from "aedes";
import { createServer as createWsServer } from "aedes-server-factory";

const PUERTO_MQTT = 1883;
const PUERTO_WS = 9001;

const aedes = await Aedes.createBroker();

createServer(aedes.handle).listen(PUERTO_MQTT, () => {
  console.log(`[broker] MQTT (TCP, para backend-server) en mqtt://localhost:${PUERTO_MQTT}`);
});

createWsServer(aedes, { ws: true }).listen(PUERTO_WS, () => {
  console.log(`[broker] MQTT sobre WebSocket (para el navegador) en ws://localhost:${PUERTO_WS}`);
});

aedes.on("client", (client) => console.log(`[broker] conectado: ${client.id}`));
aedes.on("clientDisconnect", (client) => console.log(`[broker] desconectado: ${client.id}`));
aedes.on("publish", (packet, client) => {
  if (client) console.log(`[broker] ${client.id} → ${packet.topic}`);
});

console.log("[broker] sin autenticación — SOLO para desarrollo local, nunca para producción.");
