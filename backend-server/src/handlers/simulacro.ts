// Publicación de `consolas/{id}/simulacro` — mismo patrón que
// handlers/padron.ts (ver ese archivo): se publica retained, así que una
// consola que estuvo desconectada lo recibe sola al reconectar.
//
// Igual que sincronizarPadronDeSitio, todavía no está enganchada a ningún
// disparador (ver README, "Frecuencia de sincronización" — la de padrón
// tiene el mismo problema: falta decidir el intervalo, o pasar a
// Supabase Realtime sobre `simulacros_programados`). Queda lista para que,
// cuando se decida eso, el mismo código la llame.

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import { publicarSimulacro } from "../lib/mqtt.js";
import { elegirProximoSimulacro } from "../logic/simulacro.js";
import type { PayloadSimulacroMqtt } from "../types.js";

export async function sincronizarSimulacroDeSitio(db: Db, mqttClient: MqttClient, sitioId: string): Promise<void> {
  const [simulacros, consolas] = await Promise.all([
    db.getSimulacrosProgramadosDeSitio(sitioId),
    db.getConsolasActivasDeSitio(sitioId),
  ]);

  const proximo = elegirProximoSimulacro(simulacros, new Date());
  const payload: PayloadSimulacroMqtt | null = proximo
    ? { tipo: proximo.tipoEventoNombre, fechaHora: proximo.fechaHora }
    : null;

  for (const consolaId of consolas) {
    publicarSimulacro(mqttClient, consolaId, payload);
  }
}
