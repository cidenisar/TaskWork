// Sincronización de la asignación PROG1-4 hacia una consola — ver ficha,
// consola-pi/README "Configuración PROG1-4". Se publica retained: una
// consola que estuvo desconectada la recibe sola al reconectar.
//
// Sin UI de administración todavía (Frontend Web no forma parte de este
// repo) — `consolas.prog_config` se completa a mano por SQL hasta que
// exista esa pantalla. Se llama periódicamente (ver index.ts,
// `sincronizarProgDeTodasLasConsolas`, mismo criterio que el barrido de
// padrón/simulacro) — no hay ningún evento en la app que lo dispare
// puntualmente todavía porque no hay desde dónde editarlo.

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import { publicarProg } from "../lib/mqtt.js";
import { barridoPorSitio } from "../lib/barrido.js";

export async function sincronizarProgDeConsola(db: Db, mqttClient: MqttClient, consolaId: string): Promise<void> {
  const payload = await db.getProgConfigDeConsola(consolaId);
  publicarProg(mqttClient, consolaId, payload);
}

/**
 * Barrido periódico — sincroniza PROG1-4 de TODAS las consolas. Reusa
 * `barridoPorSitio` (lib/barrido.ts) aunque acá los ids son de consolas,
 * no de sitios — la función es genérica (tag, ids, sincronizar), el
 * nombre quedó de cuando solo la usaban los barridos por sitio.
 */
export async function sincronizarProgDeTodasLasConsolas(db: Db, mqttClient: MqttClient): Promise<void> {
  const consolasIds = await db.getTodosLosIdsDeConsolas();
  await barridoPorSitio("prog", consolasIds, (consolaId) => sincronizarProgDeConsola(db, mqttClient, consolaId));
}
