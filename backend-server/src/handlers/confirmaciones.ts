// Handler de `POST /confirmaciones` (Mobile → Backend) — ver README,
// "Endpoint para las confirmaciones de Mobile". No hay tópico MQTT para
// esto a propósito (ver types.ts, PayloadConfirmacionHttp): es el mismo
// patrón push-out/REST-in que ya implica `personas.push_token`.

import type { MqttClient } from "mqtt";
import type { Db } from "../lib/db.js";
import { validarConfirmacion, extraerBearerToken } from "../logic/confirmar.js";
import { publicarAccountabilityDeEvento } from "./eventos.js";
import type { Confirmacion } from "../types.js";

export type ResultadoConfirmacion =
  | { status: 200; body: Confirmacion }
  | { status: 400; body: { error: string } }
  | { status: 401; body: { error: string } }
  | { status: 403; body: { error: string } }
  | { status: 404; body: { error: string } }
  | { status: 409; body: { error: string } };

/**
 * `authorizationHeader` es el header crudo (`Authorization: Bearer <jwt>`)
 * — la identidad de quién confirma se deriva de ahí, nunca de un campo del
 * body (ver types.ts, PayloadConfirmacionHttp, y README "Autenticación de
 * POST /confirmaciones" para por qué).
 */
export async function manejarConfirmacion(
  db: Db,
  mqttClient: MqttClient,
  authorizationHeader: string | undefined | null,
  rawBody: unknown
): Promise<ResultadoConfirmacion> {
  const token = extraerBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "falta el header Authorization: Bearer <token>" } };
  }
  const authUserId = await db.verificarJwtMobile(token);
  if (!authUserId) {
    return { status: 401, body: { error: "token inválido o expirado" } };
  }
  const persona = await db.getPersonaPorAuthUserId(authUserId);
  if (!persona) {
    return { status: 403, body: { error: "esta cuenta no está vinculada a ninguna persona del padrón" } };
  }
  const personaId = persona.id;

  const validacion = validarConfirmacion(rawBody);
  if (!validacion.ok) {
    return { status: 400, body: { error: validacion.error } };
  }
  const { eventoId, estado, puntoId, notaAyuda, ubicacionLat, ubicacionLng } = validacion.payload;

  const evento = await db.getEventoParaConfirmar(eventoId);
  if (!evento) {
    return { status: 404, body: { error: `no existe el evento ${eventoId}` } };
  }
  // Solo se confirma sobre una emergencia en curso — una vez cerrado (OK, o
  // el caso raro de un OK sin nada que cerrar), no tiene sentido de negocio
  // seguir aceptando "estoy bien"/"necesito ayuda" contra ese evento.
  if (evento.estado !== "en_curso") {
    return {
      status: 409,
      body: { error: `el evento ${eventoId} ya no está en curso (estado: ${evento.estado})` },
    };
  }

  const confirmacion = await db.actualizarConfirmacion(eventoId, personaId, {
    estado,
    punto_id: puntoId,
    nota_ayuda: notaAyuda,
    ubicacion_lat: ubicacionLat,
    ubicacion_lng: ubicacionLng,
  });
  if (!confirmacion) {
    return {
      status: 404,
      body: { error: `la persona ${personaId} no fue notificada del evento ${eventoId}` },
    };
  }

  // Enganche que quedaba pendiente en index.ts: cada escritura de una
  // confirmación recalcula y publica el resumen a las consolas del sitio.
  await publicarAccountabilityDeEvento(db, mqttClient, eventoId, evento.sitio_id);

  return { status: 200, body: confirmacion };
}
