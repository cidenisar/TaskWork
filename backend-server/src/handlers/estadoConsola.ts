// Handlers de `consolas/{id}/heartbeat` y `consolas/{id}/estado`.
// El segundo también recibe el mensaje "offline" que publica el broker en
// nombre de la consola por Last Will and Testament — ver ficha, "es lo que
// hace que una consola que se cae de golpe se vea reflejada igual".

import type { Db } from "../lib/db.js";
import type { PayloadEstadoMqtt } from "../types.js";

export async function manejarHeartbeat(db: Db, consolaId: string): Promise<void> {
  await db.actualizarHeartbeatConsola(consolaId);
}

export async function manejarEstado(db: Db, consolaId: string, payload: PayloadEstadoMqtt): Promise<void> {
  await db.actualizarEstadoConsola(consolaId, payload === "online");
}
