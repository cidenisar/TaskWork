// Sincronización del padrón de operadores hacia una consola — ver ficha,
// "Sincronización del padrón de operadores (cache local)". Se publica
// retained: una consola que estuvo desconectada la recibe sola al reconectar.
//
// Se llama: (a) periódicamente — decisión tomada (2026-08-27): cada 5
// minutos, ver index.ts (`sincronizarPadronDeTodosLosSitios`, enganchada a
// un setInterval, mismo criterio que el barrido de simulacros vencidos).
// El padrón cambia con poca frecuencia (altas, bajas, reset de PIN) — 5
// minutos de rezago es razonable, no hace falta nada más fino. (b) cada
// vez que cambia el padrón de operadores de ese sitio — todavía no
// enganchado; en producción, lo ideal sería una suscripción a cambios de
// Postgres (Supabase Realtime) sobre `operadores`/`operadores_sitios` en
// vez de esperar al próximo poll, ver README "Decisiones pendientes".

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import { publicarPadron } from "../lib/mqtt.js";
import { barridoPorSitio } from "../lib/barrido.js";
import type { PayloadPadronMqtt } from "../types.js";

export async function sincronizarPadronDeSitio(db: Db, mqttClient: MqttClient, sitioId: string): Promise<void> {
  const [operadores, consolas] = await Promise.all([
    db.getOperadoresActivosDeSitio(sitioId),
    db.getConsolasActivasDeSitio(sitioId),
  ]);

  const payload: PayloadPadronMqtt = {
    operadores: operadores.map((o) => ({ legajo: o.legajo, pinHash: o.pin_hash, rol: o.rol })),
    actualizadoAt: new Date().toISOString(),
  };

  for (const consolaId of consolas) {
    publicarPadron(mqttClient, consolaId, payload);
  }
}

/**
 * Barrido periódico — sincroniza el padrón de TODOS los sitios en
 * paralelo (ver lib/barrido.ts). Un fallo en un sitio (ej. la query de
 * operadores falla) se loguea y no frena a los demás — un sitio con
 * problemas no debería dejar sin padrón actualizado al resto.
 */
export async function sincronizarPadronDeTodosLosSitios(db: Db, mqttClient: MqttClient): Promise<void> {
  const sitiosIds = await db.getTodosLosSitiosIds();
  await barridoPorSitio("padron", sitiosIds, (sitioId) => sincronizarPadronDeSitio(db, mqttClient, sitioId));
}
