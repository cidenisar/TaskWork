// Sincronización del padrón de operadores hacia una consola — ver ficha,
// "Sincronización del padrón de operadores (cache local)". Se publica
// retained: una consola que estuvo desconectada la recibe sola al reconectar.
//
// Se llama: (a) periódicamente (ej. cada pocos minutos, ver "Próximos
// pasos" — todavía no está definida la frecuencia exacta), y (b) cada vez
// que cambia el padrón de operadores de ese sitio (alta, baja, reset de
// PIN) — en producción, lo ideal es una suscripción a cambios de Postgres
// (Supabase Realtime) sobre las tablas `operadores`/`operadores_sitios` en
// vez de solo un poll a intervalo fijo.

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import { publicarPadron } from "../lib/mqtt.js";
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
