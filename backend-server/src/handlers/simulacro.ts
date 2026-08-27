// Dos funciones sobre simulacros_programados:
//
// sincronizarSimulacroDeSitio publica `consolas/{id}/simulacro` — mismo
// patrón que handlers/padron.ts: se publica retained, así que una consola
// que estuvo desconectada lo recibe sola al reconectar. Igual que
// sincronizarPadronDeSitio, todavía no está enganchada a ningún disparador
// (ver README, "Frecuencia de sincronización" — la de padrón tiene el
// mismo problema: falta decidir el intervalo, o pasar a Supabase Realtime
// sobre esta tabla). Queda lista para que, cuando se decida eso, el mismo
// código la llame.
//
// marcarSimulacrosVencidosComoNoRealizados SÍ está enganchada — ver
// index.ts, corre en un setInterval (decisión + margen de 1h confirmados
// con el usuario, ver README "Marcar un simulacro como no_realizado").

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import { publicarSimulacro } from "../lib/mqtt.js";
import { elegirProximoSimulacro, simulacrosVencidos } from "../logic/simulacro.js";
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

/**
 * Barrido periódico (ver index.ts — a diferencia de sincronizarSimulacroDeSitio,
 * este SÍ está enganchado a un disparador: setInterval, ver README
 * "Marcar un simulacro como no_realizado"). Global, no por sitio — no hay
 * ninguna consola a la que avisarle, es un mantenimiento de estado interno.
 */
export async function marcarSimulacrosVencidosComoNoRealizados(db: Db): Promise<void> {
  const simulacros = await db.getTodosLosSimulacrosProgramadosPuntuales();
  const vencidos = simulacrosVencidos(simulacros, new Date());
  for (const s of vencidos) {
    await db.marcarSimulacroNoRealizado(s.id);
  }
  if (vencidos.length > 0) {
    console.log(`[simulacros] marcados no_realizado (vencidos hace más de 1h): ${vencidos.length}`);
  }
}
