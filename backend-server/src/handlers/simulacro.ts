// Cuatro funciones sobre simulacros_programados:
//
// sincronizarSimulacroDeSitio publica `consolas/{id}/simulacro` — mismo
// patrón que handlers/padron.ts: se publica retained, así que una consola
// que estuvo desconectada lo recibe sola al reconectar.
//
// marcarSimulacrosVencidosComoNoRealizados corre en un setInterval (ver
// index.ts; decisión + margen de 1h confirmados con el usuario, ver
// README "Marcar un simulacro como no_realizado").
//
// resolverSimulacroProgramado es el punto único por el que un simulacro
// pasa a un estado terminal — la llaman tanto el barrido de vencidos
// (no_realizado) como handlers/eventos.ts cuando dispara el evento real
// vinculado (realizado, ver README "Motor de recurrencia"). Unificado acá
// para que la generación de la próxima ocurrencia (si es recurrente) pase
// siempre por el mismo camino, sin importar CÓMO se resolvió — y ahora
// también para que la re-publicación de `consolas/{id}/simulacro` pase
// siempre por acá (ver README "Sincronización de 'próximo simulacro'").
//
// sincronizarSimulacroDeTodosLosSitios es el barrido periódico de
// respaldo (ver index.ts) — cubre el caso de una edición directa en
// `simulacros_programados` que no pasó por resolverSimulacroProgramado.

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
 *
 * Re-publica `consolas/{id}/simulacro` del sitio afectado después de
 * resolver — este es el único lugar donde el "próximo simulacro" de un
 * sitio efectivamente cambia en el flujo normal (se resolvió uno y, si era
 * recurrente, se generó el siguiente), así que es el punto natural para
 * mantener la consola al día sin depender solo del barrido periódico (ver
 * `sincronizarSimulacroDeTodosLosSitios` más abajo, que cubre el caso
 * aparte de una edición directa en la base).
 */
export async function resolverSimulacroProgramado(
  db: Db,
  mqttClient: MqttClient,
  simulacroProgramadoId: string,
  nuevoEstado: "realizado" | "no_realizado"
): Promise<SimulacroProgramado | null> {
  const resuelto = await db.transicionarSimulacro(simulacroProgramadoId, nuevoEstado);
  if (!resuelto) return null;

  const proximaFila = proximaFilaSimulacro(resuelto);
  if (proximaFila) {
    await db.insertProximaOcurrenciaSimulacro(proximaFila);
  }
  await sincronizarSimulacroDeSitio(db, mqttClient, resuelto.sitioId);
  return resuelto;
}

/**
 * Barrido periódico (ver index.ts). Marca vencidos (mismo criterio que
 * antes) y, con el broadcast ya enganchado en `resolverSimulacroProgramado`,
 * de paso reasegura el estado de todos los sitios — cubre el caso de una
 * edición directa en `simulacros_programados` que no pasó por acá (ej. un
 * alta o cambio manual en la base), mismo motivo que el barrido de padrón.
 */
export async function marcarSimulacrosVencidosComoNoRealizados(db: Db, mqttClient: MqttClient): Promise<void> {
  const simulacros = await db.getTodosLosSimulacrosProgramados();
  const vencidos = simulacrosVencidos(simulacros, new Date());
  for (const s of vencidos) {
    await resolverSimulacroProgramado(db, mqttClient, s.id, "no_realizado");
  }
  if (vencidos.length > 0) {
    console.log(`[simulacros] marcados no_realizado (vencidos hace más de 1h): ${vencidos.length}`);
  }
}

/**
 * Barrido periódico de re-sincronización de `consolas/{id}/simulacro` para
 * TODOS los sitios — red de seguridad para cambios que no pasan por
 * `resolverSimulacroProgramado` (ej. alguien edita `simulacros_programados`
 * directo en la base). Mismo criterio que `sincronizarPadronDeTodosLosSitios`:
 * un fallo en un sitio se loguea y no frena a los demás.
 */
export async function sincronizarSimulacroDeTodosLosSitios(db: Db, mqttClient: MqttClient): Promise<void> {
  const sitiosIds = await db.getTodosLosSitiosIds();
  for (const sitioId of sitiosIds) {
    try {
      await sincronizarSimulacroDeSitio(db, mqttClient, sitioId);
    } catch (err) {
      console.error(`[simulacros] error sincronizando sitio ${sitioId}:`, err);
    }
  }
}
