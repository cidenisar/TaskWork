// Cliente MQTT de la consola — mismo contrato de tópicos que
// backend-server/src/lib/mqtt.ts (ver `05.3-programacion.md`), del lado
// Pi: publica en `eventos`/`auth`/`heartbeat`/`estado`, se suscribe a
// `evento-activo`/`accountability/+`/`padron`/`simulacro`. Se autentica
// como su propia consola (usuario = CONSOLA_ID, ver backend-server/README
// "Autenticación de las consolas contra Mosquitto") — mismo patrón que ya
// usa `consola-simulador/`.

import mqtt, { type MqttClient } from "mqtt";

export function conectar(): MqttClient {
  const url = process.env.MQTT_URL ?? "mqtt://localhost:1883";
  const consolaId = requerirEnv("CONSOLA_ID");
  const password = requerirEnv("MQTT_PASSWORD");
  return mqtt.connect(url, {
    username: consolaId,
    password,
    reconnectPeriod: 2000,
    // Last Will and Testament — si la consola se cae sin avisar (corte de
    // luz, se traba, se desconecta la red), el broker publica esto por
    // ella. Retain: la próxima consulta de estado ve "offline" aunque
    // nadie esté mirando en el momento exacto de la caída.
    will: { topic: `consolas/${consolaId}/estado`, payload: "offline", qos: 1, retain: true },
  });
}

function requerirEnv(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`falta la variable de entorno ${nombre} (ver .env.example)`);
  return valor;
}

export function suscribirSaliente(client: MqttClient, consolaId: string): void {
  client.subscribe(
    [
      `consolas/${consolaId}/evento-activo`,
      `consolas/${consolaId}/accountability/+`,
      `consolas/${consolaId}/padron`,
      `consolas/${consolaId}/simulacro`,
    ],
    { qos: 1 },
    (err) => {
      if (err) throw err;
    }
  );
}

export function publicarEvento(client: MqttClient, consolaId: string, payload: unknown): void {
  client.publish(`consolas/${consolaId}/eventos`, JSON.stringify(payload), { qos: 1 });
}

export function publicarAuth(client: MqttClient, consolaId: string, payload: unknown): void {
  client.publish(`consolas/${consolaId}/auth`, JSON.stringify(payload), { qos: 1 });
}

export function publicarHeartbeat(client: MqttClient, consolaId: string, payload: unknown): void {
  client.publish(`consolas/${consolaId}/heartbeat`, JSON.stringify(payload), { qos: 0, retain: true });
}

export function publicarEstado(client: MqttClient, consolaId: string, estado: "online" | "offline"): void {
  client.publish(`consolas/${consolaId}/estado`, estado, { qos: 1, retain: true });
}

/** Nombre del tópico entrante recortado (ej. "evento-activo", "padron", "accountability/{eventoId}"). */
export function restoDeTopico(topic: string, consolaId: string): string | null {
  const prefijo = `consolas/${consolaId}/`;
  if (!topic.startsWith(prefijo)) return null;
  return topic.slice(prefijo.length);
}
