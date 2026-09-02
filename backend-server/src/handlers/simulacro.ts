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
//
// manejarProgramarSimulacro/manejarEditarSimulacro/manejarCancelarSimulacro
// son los tres endpoints de Frontend Web ("Programador de Simulacros",
// ver frontend-web/README.md) — a diferencia de Puntos de
// encuentro/Operadores/etc., programar un simulacro NO es escritura
// directa a Supabase: necesita el motor de fechas
// (`primeraOcurrenciaDesde`, ver logic/recurrencia.ts) para la
// ocurrencia inicial de un programa recurrente, y necesita re-publicar
// `consolas/{id}/simulacro` al toque después de escribir (el cliente
// MQTT solo vive acá — sin esto, la consola física tardaría hasta 15
// min en enterarse, el intervalo del barrido de respaldo).

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import { publicarSimulacro } from "../lib/mqtt.js";
import { barridoPorSitio } from "../lib/barrido.js";
import { elegirProximoSimulacro, simulacrosVencidos, proximaFilaSimulacro, validarProgramarSimulacro } from "../logic/simulacro.js";
import { primeraOcurrenciaDesde } from "../logic/recurrencia.js";
import { autenticarAdmin } from "./operadores.js";
import type { PayloadSimulacroMqtt, SimulacroProgramado, ReglaRecurrencia } from "../types.js";

interface ResultadoHandler {
  status: number;
  body: unknown;
}

/** Arma la `fecha_hora` concreta a partir del payload ya validado — puntual es directo, recurrente pasa por `primeraOcurrenciaDesde`. Devuelve también la `recurrencia` a persistir (null si puntual). */
function calcularFechaHoraYRecurrencia(payload: {
  puntual: boolean;
  fecha: string | null;
  hora: string;
  diaSemana: number | null;
  posicion: number | null;
}): { fechaHora: string; recurrencia: ReglaRecurrencia | null } {
  const [horas, minutos] = payload.hora.split(":").map(Number);
  if (payload.puntual) {
    return { fechaHora: new Date(`${payload.fecha}T${payload.hora}:00.000Z`).toISOString(), recurrencia: null };
  }
  const regla: ReglaRecurrencia = {
    tipo: "posicion",
    diaSemana: payload.diaSemana as 0 | 1 | 2 | 3 | 4 | 5 | 6,
    posicion: payload.posicion as 1 | 2 | 3 | 4 | -1,
    cadaMeses: 1,
  };
  return { fechaHora: primeraOcurrenciaDesde(regla, new Date(), horas, minutos).toISOString(), recurrencia: regla };
}

export async function manejarProgramarSimulacro(db: Db, mqttClient: MqttClient, authorizationHeader: string | undefined | null, rawBody: unknown): Promise<ResultadoHandler> {
  const auth = await autenticarAdmin(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const validacion = validarProgramarSimulacro(rawBody);
  if (!validacion.ok) return { status: 400, body: { error: validacion.error } };
  const { payload } = validacion;

  const [sitioOk, tipoOk] = await Promise.all([
    db.sitiosPertenecenAOrganizacion([payload.sitioId], auth.organizacionId),
    db.tipoEventoPerteneceAOrganizacion(payload.tipoEventoId, auth.organizacionId),
  ]);
  if (!sitioOk) return { status: 400, body: { error: "el sitio no pertenece a tu organización" } };
  if (!tipoOk) return { status: 400, body: { error: "el tipo de evento no pertenece a tu organización" } };

  const { fechaHora, recurrencia } = calcularFechaHoraYRecurrencia(payload);
  const creado = await db.crearSimulacroProgramado({ sitioId: payload.sitioId, tipoEventoId: payload.tipoEventoId, puntual: payload.puntual, fechaHora, recurrencia });
  await sincronizarSimulacroDeSitio(db, mqttClient, payload.sitioId);
  return { status: 201, body: creado };
}

export async function manejarEditarSimulacro(db: Db, mqttClient: MqttClient, authorizationHeader: string | undefined | null, id: string, rawBody: unknown): Promise<ResultadoHandler> {
  const auth = await autenticarAdmin(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const actual = await db.getSitioYEstadoDeSimulacro(id);
  if (!actual) return { status: 404, body: { error: "no existe ese simulacro programado" } };
  const sitioOk = await db.sitiosPertenecenAOrganizacion([actual.sitioId], auth.organizacionId);
  if (!sitioOk) return { status: 404, body: { error: "no existe ese simulacro programado" } }; // 404, no 403 — no confirmar existencia de un id ajeno
  if (actual.estado !== "programado" && actual.estado !== "pendiente_confirmacion") {
    return { status: 409, body: { error: "este simulacro ya se resolvió — no se puede editar" } };
  }

  const validacion = validarProgramarSimulacro(rawBody);
  if (!validacion.ok) return { status: 400, body: { error: validacion.error } };
  const { payload } = validacion;
  if (payload.sitioId !== actual.sitioId) {
    return { status: 400, body: { error: "un simulacro programado no se puede mover de sitio — cancelalo y programá uno nuevo en el otro sitio" } };
  }
  const tipoOk = await db.tipoEventoPerteneceAOrganizacion(payload.tipoEventoId, auth.organizacionId);
  if (!tipoOk) return { status: 400, body: { error: "el tipo de evento no pertenece a tu organización" } };

  const { fechaHora, recurrencia } = calcularFechaHoraYRecurrencia(payload);
  const editado = await db.editarSimulacroProgramado(id, { tipoEventoId: payload.tipoEventoId, puntual: payload.puntual, fechaHora, recurrencia });
  if (!editado) return { status: 409, body: { error: "este simulacro ya se resolvió — no se pudo editar" } };
  await sincronizarSimulacroDeSitio(db, mqttClient, actual.sitioId);
  return { status: 200, body: editado };
}

export async function manejarCancelarSimulacro(db: Db, mqttClient: MqttClient, authorizationHeader: string | undefined | null, id: string): Promise<ResultadoHandler> {
  const auth = await autenticarAdmin(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const actual = await db.getSitioYEstadoDeSimulacro(id);
  if (!actual) return { status: 404, body: { error: "no existe ese simulacro programado" } };
  const sitioOk = await db.sitiosPertenecenAOrganizacion([actual.sitioId], auth.organizacionId);
  if (!sitioOk) return { status: 404, body: { error: "no existe ese simulacro programado" } };

  const cancelado = await db.cancelarSimulacroProgramado(id);
  if (!cancelado) return { status: 409, body: { error: "este simulacro ya se resolvió — no se pudo cancelar" } };
  await sincronizarSimulacroDeSitio(db, mqttClient, actual.sitioId);
  return { status: 200, body: { ok: true } };
}

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
  let marcados = 0;
  for (const s of vencidos) {
    // resolverSimulacroProgramado ahora hace I/O extra (re-publicar
    // consolas/{id}/simulacro, ver más arriba) — sin este try/catch, un
    // fallo transitorio en UN simulacro (ej. el broadcast MQTT) frenaba el
    // resto del barrido y dejaba sin marcar todo lo que venía después en
    // `vencidos`, no solo lo que falló (hallazgo de code review).
    try {
      await resolverSimulacroProgramado(db, mqttClient, s.id, "no_realizado");
      marcados++;
    } catch (err) {
      console.error(`[simulacros] error marcando no_realizado el simulacro ${s.id}:`, err);
    }
  }
  if (marcados > 0) {
    console.log(`[simulacros] marcados no_realizado (vencidos hace más de 1h): ${marcados}`);
  }
}

/**
 * Barrido periódico de re-sincronización de `consolas/{id}/simulacro` para
 * TODOS los sitios, en paralelo (ver lib/barrido.ts) — red de seguridad
 * para cambios que no pasan por `resolverSimulacroProgramado` (ej.
 * alguien edita `simulacros_programados` directo en la base). Mismo
 * criterio que `sincronizarPadronDeTodosLosSitios`: un fallo en un sitio
 * se loguea y no frena a los demás.
 */
export async function sincronizarSimulacroDeTodosLosSitios(db: Db, mqttClient: MqttClient): Promise<void> {
  const sitiosIds = await db.getTodosLosSitiosIds();
  await barridoPorSitio("simulacros", sitiosIds, (sitioId) => sincronizarSimulacroDeSitio(db, mqttClient, sitioId));
}
