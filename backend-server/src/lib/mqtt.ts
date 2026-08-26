// Wrapper del cliente MQTT — implementa la convención de tópicos de
// 05.3-programacion.md, sección "Comunicación Pi ↔ Backend Online — MQTT".

import mqtt, { type MqttClient } from "mqtt";

export type EventoTopicoEntrante = "eventos" | "auth" | "heartbeat" | "estado";

export function conectar(): MqttClient {
  const url = process.env.MQTT_URL ?? "mqtt://localhost:1883";
  const username = process.env.MQTT_USERNAME || undefined;
  const password = process.env.MQTT_PASSWORD || undefined;
  return mqtt.connect(url, { username, password, reconnectPeriod: 2000 });
}

/** Extrae el {id} de consola de un tópico `consolas/{id}/resto/del/topico`. */
export function idConsolaDeTopico(topic: string): { consolaId: string; resto: string } | null {
  const partes = topic.split("/");
  if (partes.length < 3 || partes[0] !== "consolas") return null;
  return { consolaId: partes[1], resto: partes.slice(2).join("/") };
}

export function suscribirEntrantes(client: MqttClient): void {
  // QoS 1 en las cuatro — ver tabla de la ficha (eventos, auth y estado son
  // QoS 1; heartbeat es QoS 0 pero suscribirse con 1 no rompe nada).
  client.subscribe(
    ["consolas/+/eventos", "consolas/+/auth", "consolas/+/heartbeat", "consolas/+/estado"],
    { qos: 1 },
    (err) => {
      if (err) throw err;
    }
  );
}

export function publicarPadron(client: MqttClient, consolaId: string, payload: unknown): void {
  client.publish(`consolas/${consolaId}/padron`, JSON.stringify(payload), { qos: 1, retain: true });
}

export function publicarSimulacro(client: MqttClient, consolaId: string, payload: unknown): void {
  client.publish(`consolas/${consolaId}/simulacro`, JSON.stringify(payload), { qos: 1, retain: true });
}

export function publicarAccountability(client: MqttClient, consolaId: string, eventoId: string, payload: unknown): void {
  client.publish(`consolas/${consolaId}/accountability/${eventoId}`, JSON.stringify(payload), { qos: 0 });
}

/** payload null = "no hay evento activo relevante" (ver ficha). */
export function publicarEventoActivo(client: MqttClient, consolaId: string, payload: unknown | null): void {
  client.publish(`consolas/${consolaId}/evento-activo`, JSON.stringify(payload), { qos: 1, retain: true });
}
