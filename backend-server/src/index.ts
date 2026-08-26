// Punto de entrada — conecta a Supabase y al broker MQTT, y engancha cada
// tópico entrante con su handler. Ver README.md para cómo correr esto de
// verdad (necesita `npm install` en un entorno con acceso a internet, y las
// credenciales reales en `.env`).

import "dotenv/config";
import { crearClienteDb, Db } from "./lib/db.js";
import { conectar, suscribirEntrantes, idConsolaDeTopico } from "./lib/mqtt.js";
import { manejarEvento, publicarAccountabilityDeEvento } from "./handlers/eventos.js";
import { manejarAuth } from "./handlers/auth.js";
import { manejarHeartbeat, manejarEstado } from "./handlers/estadoConsola.js";
import type {
  PayloadEventoMqtt,
  PayloadAuthMqtt,
  PayloadEstadoMqtt,
} from "./types.js";

const db = new Db(crearClienteDb());
const mqttClient = conectar();

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
    await manejarEvento(db, mqttClient, payload);
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

// TODO: publicarAccountabilityDeEvento hay que llamarlo cada vez que se
// escribe una confirmación (ver "Próximos pasos" — falta el endpoint/canal
// por el que Mobile manda "estoy bien"/"necesito ayuda"; cuando exista, ese
// mismo código llama a esta función después de cada escritura). Se deja
// importada acá para dejar visible el enganche pendiente, no para que quede
// sin usar silenciosamente.
void publicarAccountabilityDeEvento;

console.log("[backend-online] arrancando…");
