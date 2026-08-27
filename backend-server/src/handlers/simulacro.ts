// Tres funciones sobre simulacros_programados:
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
//
// resolverSimulacroProgramado es el punto único por el que un simulacro
// pasa a un estado terminal — la llaman tanto el barrido de vencidos
// (no_realizado) como handlers/eventos.ts cuando dispara el evento real
// vinculado (realizado, ver README "Motor de recurrencia"). Unificado acá
// para que la generación de la próxima ocurrencia (si es recurrente) pase
// siempre por el mismo camino, sin importar CÓMO se resolvió.

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import { publicarSimulacro } from "../lib/mqtt.js";
import { elegirProximoSimulacro, simulacrosVencidos, proximaFilaSimulacro } from "../logic/simulacro.js";
import type { PayloadSimulacroMqtt, SimulacroProgramado } from "../types.js";

export async function sincronizarSimulacroDeSitio(db: Db, mqttClient: MqttClient, sitioId: string): Promise<void> {
  const [simulacros, consolas] = await Promise.all([
    db.getSimulacrosProgramadosDeSitio(sitioId),
    db.getConsolasActivasDeSitio(sitioId),
  ]);

  // elegirProximoSimulacro ya excluye los `sorpresa` — este broadcast
  // anticipado nunca los revela (ver logic/simulacro.ts).
  const proximo = elegirProximoSimulacro(simulacros, new Date());
  const payload: PayloadSimulacroMqtt | null = proximo
    ? { tipo: proximo.tipoEventoNombre, fechaHora: proximo.fechaHora, escenario: proximo.escenario }
    : null;

  for (const consolaId of consolas) {
    publicarSimulacro(mqttClient, consolaId, payload);
  }
}

/**
 * Transiciona un simulacro `programado` a un estado terminal y, si es
 * recurrente, genera la fila de la próxima ocurrencia. Devuelve la fila
 * resuelta (o null si el id no existe o ya no estaba en `programado` —
 * puede pasar por una carrera legítima, ej. venció justo cuando alguien lo
 * disparaba, no es un caso excepcional que haya que frenar) para que el
 * caller pueda usar su `escenario`/tipo en lo que siga (ver
 * handlers/eventos.ts, el mensaje de despacho).
 */
export async function resolverSimulacroProgramado(
  db: Db,
  simulacroProgramadoId: string,
  nuevoEstado: "realizado" | "no_realizado"
): Promise<SimulacroProgramado | null> {
  const resuelto = await db.transicionarSimulacro(simulacroProgramadoId, nuevoEstado);
  if (!resuelto) return null;

  const proximaFila = proximaFilaSimulacro(resuelto);
  if (proximaFila) {
    await db.insertProximaOcurrenciaSimulacro(proximaFila);
  }
  return resuelto;
}

/**
 * Barrido periódico (ver index.ts). Global, no por sitio — no hay ninguna
 * consola a la que avisarle, es un mantenimiento de estado interno.
 */
export async function marcarSimulacrosVencidosComoNoRealizados(db: Db): Promise<void> {
  const simulacros = await db.getTodosLosSimulacrosProgramados();
  const vencidos = simulacrosVencidos(simulacros, new Date());
  for (const s of vencidos) {
    await resolverSimulacroProgramado(db, s.id, "no_realizado");
  }
  if (vencidos.length > 0) {
    console.log(`[simulacros] marcados no_realizado (vencidos hace más de 1h): ${vencidos.length}`);
  }
}
