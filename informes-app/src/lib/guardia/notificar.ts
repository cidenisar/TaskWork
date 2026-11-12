/**
 * Capa de notificaciones de Guardia General (HANDOFF §9): escribe la fila
 * del outbox y manda el push DE INMEDIATO desde el mismo pedido que
 * disparó el aviso — no hace falta esperar a ningún cron para el caso
 * normal. El cron de reintentos (`/api/cron/guardia-reintentar-notificaciones`,
 * `reintentarNotificacion()` acá abajo) es solo la red de seguridad para
 * cuando el envío inmediato falla (sin suscripción todavía, el servicio
 * de push caído un momento, etc.).
 *
 * "Que una falla de envío no frene la operación" (criterio de Ivan) — esta
 * función NUNCA tira: cualquier error de la base, de `web-push` o de la
 * suscripción queda en la fila (estado `fallida`, con el motivo) y listo.
 */
import { sendNotification, setVapidDetails } from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TipoNotificacionGuardia } from "@/lib/database.types";

export interface PayloadNotificacion {
  title: string;
  body: string;
  url: string;
}

function vapidListo(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function esViolacionDeUnicidad(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

/** HTTP 404/410 del servicio de push = la suscripción ya no existe (el navegador la revocó, se desinstaló, etc.) — nunca más va a funcionar, hay que borrarla. */
function esSuscripcionMuerta(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
}

/** El intento de envío en sí — lo usan `notificar()` (intento inmediato) y el cron de reintentos (intentos siguientes) por igual. Siempre deja la fila en `enviada` o `fallida`, nunca tira. */
export async function intentarEnviar(
  service: SupabaseClient<Database>,
  filaId: string,
  usuarioId: string,
  payload: PayloadNotificacion,
  intentosPrevios: number,
): Promise<void> {
  if (!vapidListo()) {
    await service.from("guardia_notificacion").update({ estado: "fallida", error: "VAPID sin configurar.", intentos: intentosPrevios + 1 }).eq("id", filaId);
    return;
  }

  const { data: subs } = await service.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("usuario_id", usuarioId);
  if (!subs || subs.length === 0) {
    await service.from("guardia_notificacion").update({ estado: "fallida", error: "Sin suscripción push activa.", intentos: intentosPrevios + 1 }).eq("id", filaId);
    return;
  }

  let algunoOk = false;
  let ultimoError = "";
  for (const sub of subs) {
    try {
      await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ ...payload, notificacionId: filaId }));
      algunoOk = true;
    } catch (err) {
      if (esSuscripcionMuerta(err)) {
        await service.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        ultimoError = err instanceof Error ? err.message : "Error desconocido al enviar.";
      }
    }
  }

  await service
    .from("guardia_notificacion")
    .update(
      algunoOk
        ? { estado: "enviada", enviada_at: new Date().toISOString(), intentos: intentosPrevios + 1 }
        : { estado: "fallida", error: ultimoError || "No se pudo enviar a ninguna suscripción.", intentos: intentosPrevios + 1 },
    )
    .eq("id", filaId);
}

export async function notificar(usuarioId: string, tipo: TipoNotificacionGuardia, refTipo: string, refId: string, payload: PayloadNotificacion): Promise<void> {
  try {
    const service = createServiceRoleClient();

    const { data: fila, error: errInsert } = await service
      .from("guardia_notificacion")
      .insert({ usuario_id: usuarioId, tipo, ref_tipo: refTipo, ref_id: refId, payload })
      .select("id")
      .single();
    if (errInsert) {
      if (!esViolacionDeUnicidad(errInsert)) console.error("notificar(): no se pudo escribir el outbox", errInsert);
      return; // ya existía (mismo aviso, mismo disparo) o no se pudo escribir — no hay nada más para hacer acá
    }

    await intentarEnviar(service, fila.id, usuarioId, payload, 0);
  } catch (err) {
    console.error("notificar(): error inesperado", err);
  }
}
