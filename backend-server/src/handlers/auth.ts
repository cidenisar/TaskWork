import type { Db } from "../lib/db.js";
import { construirRegistroAuditoria } from "../logic/auth.js";
import type { PayloadAuthMqtt } from "../types.js";

export async function manejarAuth(db: Db, consolaId: string, payload: PayloadAuthMqtt): Promise<void> {
  const registro = construirRegistroAuditoria(payload, consolaId);
  await db.insertAuditoriaPin(registro);
}
