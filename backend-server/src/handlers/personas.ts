// Handlers de alta de personas desde Mobile (ver README, "Autoregistro
// de personas (Mobile)" y src/types.ts para el porqué de la forma de
// cada body). Los tres exigen JWT de Supabase Auth — pero a diferencia
// de `handlers/operadores.ts` no hace falta ningún rol particular: el
// JWT puede ser de una sesión anónima (`signInAnonymously()`, Mobile la
// crea sola al instalar la app, sin ninguna pantalla de login) — lo
// único que hace falta es un `auth_user_id` real para vincular.

import type { App } from "firebase-admin/app";
import type { Db } from "../lib/db.js";
import { extraerBearerToken } from "../logic/confirmar.js";
import { validarReclamarPersona, validarAutoregistro, validarCanjearCodigo, validarActualizarPushToken } from "../logic/personas.js";
import { permitirIntento } from "../lib/rateLimit.js";
import { autenticarAdmin } from "./operadores.js";
import { enviarPush } from "../lib/push.js";

type ResultadoBase =
  | { status: 400; body: { error: string } }
  | { status: 401; body: { error: string } }
  | { status: 404; body: { error: string } }
  | { status: 409; body: { error: string } }
  | { status: 429; body: { error: string } };

// Ver README, "Precauciones al habilitar Anonymous Sign-ins" — además
// del límite por IP (http.ts), `reclamar` tiene esto: un límite por
// legajo+DNI puntual, para que alguien con muchas IPs distintas (o
// muchas sesiones anónimas detrás de la misma IP) no pueda seguir
// probando contra la MISMA identidad ajena. Es el endpoint de mayor
// riesgo de los tres — adivinar legajo+DNI de una persona real
// significaría empezar a recibir SUS alertas en vez de la persona
// real, en un sistema donde eso importa de verdad.
const LIMITE_INTENTOS_RECLAMO_POR_OBJETIVO = 10;
const VENTANA_INTENTOS_RECLAMO_MS = 30 * 60_000;

export type ResultadoReclamarPersona = ResultadoBase | { status: 200; body: { id: string; yaEstabaVinculada: boolean } };

export type ResultadoAutoregistro = ResultadoBase | { status: 201; body: { id: string; estado: "pendiente_aprobacion" } };

export type ResultadoCanjearCodigo =
  | ResultadoBase
  | { status: 201; body: { id: string; estado: "activo"; empresa: string; sitioId: string; vencimiento: string } };

/** Auth compartida por los tres handlers — a diferencia de operadores.ts, cualquier JWT válido alcanza (incluida una sesión anónima). */
async function autenticarSesion(
  db: Db,
  authorizationHeader: string | undefined | null
): Promise<{ ok: true; authUserId: string } | { ok: false; status: 401; error: string }> {
  const token = extraerBearerToken(authorizationHeader);
  if (!token) return { ok: false, status: 401, error: "falta el header Authorization: Bearer <token>" };
  const authUserId = await db.verificarJwt(token);
  if (!authUserId) return { ok: false, status: 401, error: "token inválido o expirado" };
  return { ok: true, authUserId };
}

export async function manejarReclamarPersona(
  db: Db,
  authorizationHeader: string | undefined | null,
  rawBody: unknown
): Promise<ResultadoReclamarPersona> {
  const auth = await autenticarSesion(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const validacion = validarReclamarPersona(rawBody);
  if (!validacion.ok) return { status: 400, body: { error: validacion.error } };

  const claveObjetivo = `reclamar:${validacion.payload.legajo}:${validacion.payload.dni}`;
  if (!permitirIntento(claveObjetivo, LIMITE_INTENTOS_RECLAMO_POR_OBJETIVO, VENTANA_INTENTOS_RECLAMO_MS)) {
    return { status: 429, body: { error: "demasiados intentos contra ese legajo/DNI — esperá un rato" } };
  }

  const persona = await db.getPersonaPorLegajoYDni(validacion.payload.legajo, validacion.payload.dni);
  if (!persona) {
    // Mobile interpreta esto como "no te encontramos" y pasa a la
    // pantalla de autoregistro — no es un error del cliente.
    return { status: 404, body: { error: "no se encontró ningún registro con ese legajo y DNI" } };
  }

  if (persona.authUserId === auth.authUserId) {
    // Reintento del mismo dispositivo (ej. la app se cerró justo
    // después de vincular) — idempotente, no un error.
    return { status: 200, body: { id: persona.id, yaEstabaVinculada: true } };
  }
  if (persona.authUserId !== null) {
    // Alguien ya reclamó este registro desde otro dispositivo/sesión —
    // nunca pisarlo silenciosamente (le robaría las alertas a quien lo
    // reclamó primero).
    return { status: 409, body: { error: "este registro ya está reclamado desde otro dispositivo" } };
  }

  await db.vincularAuthUserPersona(persona.id, auth.authUserId);
  return { status: 200, body: { id: persona.id, yaEstabaVinculada: false } };
}

export async function manejarAutoregistro(
  db: Db,
  authorizationHeader: string | undefined | null,
  rawBody: unknown
): Promise<ResultadoAutoregistro> {
  const auth = await autenticarSesion(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const validacion = validarAutoregistro(rawBody);
  if (!validacion.ok) return { status: 400, body: { error: validacion.error } };

  // Un dispositivo no puede autoregistrarse dos veces — evita que
  // reintentos/dobles taps generen solicitudes duplicadas pendientes de
  // aprobación para la misma persona.
  const existente = await db.getPersonaPorAuthUserId(auth.authUserId);
  if (existente) {
    return { status: 409, body: { error: "esta sesión ya tiene una persona vinculada" } };
  }

  const sitio = await db.getSitioParaAutoregistro(validacion.payload.sitioId);
  if (!sitio) return { status: 400, body: { error: `no existe el sitio ${validacion.payload.sitioId}` } };

  const id = await db.crearPersonaAutoregistro({
    organizacionId: sitio.organizacionId,
    sitioId: sitio.id,
    nombre: validacion.payload.nombre,
    dni: validacion.payload.dni,
    legajo: validacion.payload.legajo,
    telefono: validacion.payload.telefono,
    authUserId: auth.authUserId,
  });

  return { status: 201, body: { id, estado: "pendiente_aprobacion" } };
}

export async function manejarCanjearCodigo(
  db: Db,
  authorizationHeader: string | undefined | null,
  rawBody: unknown
): Promise<ResultadoCanjearCodigo> {
  const auth = await autenticarSesion(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const validacion = validarCanjearCodigo(rawBody);
  if (!validacion.ok) return { status: 400, body: { error: validacion.error } };
  const { codigo, nombre, telefono, dni } = validacion.payload;

  const existente = await db.getPersonaPorAuthUserId(auth.authUserId);
  if (existente) {
    return { status: 409, body: { error: "esta sesión ya tiene una persona vinculada" } };
  }

  const codigoAcceso = await db.getCodigoAccesoPorCodigo(codigo);
  if (!codigoAcceso) return { status: 404, body: { error: "código inválido" } };

  // El chequeo de forma acá es solo para dar un mensaje claro antes de
  // gastar el intento atómico — `intentarUsarCodigo` es la fuente de
  // verdad real (puede rechazar igual si el estado cambió justo en el
  // medio, ver README).
  if (codigoAcceso.estado !== "vigente") {
    return { status: 400, body: { error: `código ${codigoAcceso.estado}` } };
  }
  if (codigoAcceso.vencimiento < new Date().toISOString().slice(0, 10)) {
    return { status: 400, body: { error: "código vencido" } };
  }
  if (codigoAcceso.tipo === "individual" && codigoAcceso.dni && dni && codigoAcceso.dni !== dni) {
    return { status: 400, body: { error: "el DNI no coincide con este código" } };
  }

  const pudoUsarse = await db.intentarUsarCodigo(codigoAcceso.id);
  if (!pudoUsarse) {
    return { status: 400, body: { error: "código sin cupo disponible" } };
  }

  const dniFinal = dni ?? codigoAcceso.dni;
  if (!dniFinal) {
    // El código no trae DNI propio (ej. un código de lote genérico) y
    // tampoco lo mandó la persona — no hay con qué completar
    // `personas.dni` (NOT NULL). El uso ya quedó consumido arriba: es
    // una situación rara (Mobile debería pedir el DNI en este caso),
    // no vale la pena devolverle el cupo por un caso de borde.
    return { status: 400, body: { error: "falta el DNI — el código no trae uno propio" } };
  }

  const id = await db.crearPersonaPorCodigo({
    organizacionId: codigoAcceso.organizacionId,
    sitioId: codigoAcceso.sitioId,
    nombre,
    dni: dniFinal,
    telefono,
    empresa: codigoAcceso.empresa,
    vencimiento: codigoAcceso.vencimiento,
    authUserId: auth.authUserId,
  });
  await db.registrarUsoCodigo(codigoAcceso.id, id);

  return { status: 201, body: { id, estado: "activo", empresa: codigoAcceso.empresa, sitioId: codigoAcceso.sitioId, vencimiento: codigoAcceso.vencimiento } };
}

export type ResultadoActualizarPushToken = ResultadoBase | { status: 200; body: { ok: true } };

export async function manejarActualizarPushToken(
  db: Db,
  authorizationHeader: string | undefined | null,
  rawBody: unknown
): Promise<ResultadoActualizarPushToken> {
  const auth = await autenticarSesion(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const validacion = validarActualizarPushToken(rawBody);
  if (!validacion.ok) return { status: 400, body: { error: validacion.error } };

  const persona = await db.getPersonaPorAuthUserId(auth.authUserId);
  if (!persona) return { status: 404, body: { error: "esta sesión no tiene ninguna persona vinculada" } };

  await db.actualizarPushTokenPersona(persona.id, validacion.payload.pushToken);
  return { status: 200, body: { ok: true } };
}

// --- Aprobar/rechazar un autoregistro (ver README, "Aprobar/rechazar un
// autoregistro") — a diferencia de los cuatro handlers de arriba, estos
// dos son para Frontend Web, solo-admin (misma auth que
// handlers/operadores.ts, reusada de ahí en vez de duplicarla). No queda
// como escritura directa de Frontend contra Supabase (aunque RLS
// técnicamente lo permitiría, `org_isolation` es FOR ALL) porque aprobar
// necesita además avisarle a la persona por push que ya puede usar la
// app — Frontend nunca tiene las credenciales de Firebase.

type ResultadoAdmin =
  | { status: 401; body: { error: string } }
  | { status: 403; body: { error: string } }
  | { status: 404; body: { error: string } }
  | { status: 409; body: { error: string } };

export type ResultadoAprobarPersona =
  | ResultadoAdmin
  | { status: 200; body: { id: string; estado: "activo"; notificado: boolean; errorNotificacion?: string } };

export type ResultadoRechazarPersona = ResultadoAdmin | { status: 200; body: { id: string; estado: "rechazado" } };

/** Común a aprobar/rechazar: auth de admin + que la persona exista, sea de su organización, y esté pendiente de aprobación. */
async function autenticarYBuscarPendiente(
  db: Db,
  authorizationHeader: string | undefined | null,
  personaId: string
): Promise<{ ok: true; persona: { id: string; pushToken: string | null } } | { ok: false; status: 401 | 403 | 404 | 409; error: string }> {
  const auth = await autenticarAdmin(db, authorizationHeader);
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

  const persona = await db.getPersonaPorId(personaId);
  // Mismo 404 tanto si no existe como si es de otra organización — mismo
  // criterio que manejarResetearPin, no darle a un admin ajeno ninguna
  // pista de que ese id existe en algún lado.
  if (!persona || persona.organizacionId !== auth.organizacionId) {
    return { ok: false, status: 404, error: `no existe la persona ${personaId}` };
  }
  if (persona.estado !== "pendiente_aprobacion") {
    return { ok: false, status: 409, error: `esta persona no tiene un autoregistro pendiente de aprobación (estado actual: ${persona.estado})` };
  }
  return { ok: true, persona: { id: persona.id, pushToken: persona.pushToken } };
}

export async function manejarAprobarPersona(
  db: Db,
  pushApp: App | null,
  authorizationHeader: string | undefined | null,
  personaId: string
): Promise<ResultadoAprobarPersona> {
  const busqueda = await autenticarYBuscarPendiente(db, authorizationHeader, personaId);
  if (!busqueda.ok) return { status: busqueda.status, body: { error: busqueda.error } };

  await db.actualizarEstadoPersona(personaId, "activo");

  // El aviso por push es best-effort — igual que la invitación por email
  // en manejarCrearOperador, un fallo acá (sin token todavía, Firebase no
  // configurado, token inválido) no debe deshacer la aprobación en sí.
  if (!busqueda.persona.pushToken) {
    return { status: 200, body: { id: personaId, estado: "activo", notificado: false } };
  }
  if (!pushApp) {
    return { status: 200, body: { id: personaId, estado: "activo", notificado: false, errorNotificacion: "Firebase no configurado" } };
  }
  try {
    await enviarPush(pushApp, busqueda.persona.pushToken, {
      titulo: "Registro aprobado",
      cuerpo: "Ya podés usar la app para recibir alertas de tu sitio.",
      data: { tipo: "autoregistro_aprobado", personaId },
    });
    return { status: 200, body: { id: personaId, estado: "activo", notificado: true } };
  } catch (err) {
    return { status: 200, body: { id: personaId, estado: "activo", notificado: false, errorNotificacion: String(err) } };
  }
}

export async function manejarRechazarPersona(
  db: Db,
  authorizationHeader: string | undefined | null,
  personaId: string
): Promise<ResultadoRechazarPersona> {
  const busqueda = await autenticarYBuscarPendiente(db, authorizationHeader, personaId);
  if (!busqueda.ok) return { status: busqueda.status, body: { error: busqueda.error } };

  await db.actualizarEstadoPersona(personaId, "rechazado");
  return { status: 200, body: { id: personaId, estado: "rechazado" } };
}
