// Handlers de administración de operadores (Frontend Web → Backend, ver
// README "Alta de operadores y login web para admins"). Solo admins
// (mismo mecanismo de auth que GET /simulacros/cumplimiento: JWT de
// Supabase Auth → operador → chequeo de rol) — nunca escrito por
// Frontend directo contra Supabase pese a que RLS técnicamente se lo
// permitiría, porque crear/resetear implica generar y hashear un PIN
// nuevo e, si corresponde, invitar por email con la Admin API de
// Supabase Auth — ninguna de las dos cosas es posible desde el
// navegador (necesitan `service_role` y `bcryptjs` respectivamente).

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Db } from "../lib/db.js";
import { extraerBearerToken } from "../logic/confirmar.js";
import { validarCrearOperador, generarPin } from "../logic/operadores.js";

const RONDAS_BCRYPT = 10; // mismo valor que consola-pi usa al comparar, ver consola-pi/src/logic/pin.ts

export type ResultadoCrearOperador =
  | { status: 201; body: { id: string; pin: string; invitado: boolean; errorInvitacion?: string } }
  | { status: 400; body: { error: string } }
  | { status: 401; body: { error: string } }
  | { status: 403; body: { error: string } };

export type ResultadoResetearPin =
  | { status: 200; body: { pin: string } }
  | { status: 401; body: { error: string } }
  | { status: 403; body: { error: string } }
  | { status: 404; body: { error: string } };

/** Auth compartida por los dos handlers de este archivo — JWT → operador → rol admin. */
async function autenticarAdmin(
  db: Db,
  authorizationHeader: string | undefined | null
): Promise<{ ok: true; organizacionId: string } | { ok: false; status: 401 | 403; error: string }> {
  const token = extraerBearerToken(authorizationHeader);
  if (!token) return { ok: false, status: 401, error: "falta el header Authorization: Bearer <token>" };
  const authUserId = await db.verificarJwt(token);
  if (!authUserId) return { ok: false, status: 401, error: "token inválido o expirado" };
  const admin = await db.getOperadorPorAuthUserId(authUserId);
  if (!admin) return { ok: false, status: 403, error: "esta cuenta no está vinculada a ningún operador" };
  if (admin.rol !== "admin") return { ok: false, status: 403, error: "se requiere rol admin" };
  return { ok: true, organizacionId: admin.organizacionId };
}

export async function manejarCrearOperador(
  db: Db,
  authorizationHeader: string | undefined | null,
  rawBody: unknown
): Promise<ResultadoCrearOperador> {
  const auth = await autenticarAdmin(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const validacion = validarCrearOperador(rawBody);
  if (!validacion.ok) return { status: 400, body: { error: validacion.error } };
  const { nombre, legajo, rol, alcanceTipo, sitiosIds, email } = validacion.payload;

  if (alcanceTipo === "sitio") {
    const pertenecen = await db.sitiosPertenecenAOrganizacion(sitiosIds, auth.organizacionId);
    if (!pertenecen) {
      return { status: 400, body: { error: "uno o más sitios no pertenecen a tu organización" } };
    }
  }

  const pin = generarPin(() => randomInt(10000));
  const pinHash = await bcrypt.hash(pin, RONDAS_BCRYPT);

  const operadorId = await db.crearOperador({ organizacionId: auth.organizacionId, nombre, legajo, rol, alcanceTipo, pinHash });
  if (sitiosIds.length > 0) await db.vincularSitiosOperador(operadorId, sitiosIds);

  // La invitación por email va AL FINAL, después de que el operador ya
  // existe — si falla (email en uso, Supabase caído, lo que sea), el
  // operador queda creado igual (con PIN, sin login web todavía) en vez
  // de perderse todo por un problema de una parte opcional. El llamado
  // devuelve 201 con el detalle del error en vez de un 5xx, para que
  // Frontend pueda mostrar "operador creado, pero la invitación falló —
  // reintentar" sin ambigüedad.
  if (email) {
    const invitacion = await db.invitarOperadorPorEmail(email);
    if (!invitacion.ok) {
      return { status: 201, body: { id: operadorId, pin, invitado: false, errorInvitacion: invitacion.error } };
    }
    await db.vincularAuthUserOperador(operadorId, invitacion.authUserId);
    return { status: 201, body: { id: operadorId, pin, invitado: true } };
  }

  return { status: 201, body: { id: operadorId, pin, invitado: false } };
}

export async function manejarResetearPin(
  db: Db,
  authorizationHeader: string | undefined | null,
  operadorId: string
): Promise<ResultadoResetearPin> {
  const auth = await autenticarAdmin(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const objetivo = await db.getOperadorPorId(operadorId);
  // Mismo 404 tanto si no existe como si es de otra organización — no
  // hay que darle a un admin de otra organización ninguna pista de que
  // ese id existe en algún lado.
  if (!objetivo || objetivo.organizacionId !== auth.organizacionId) {
    return { status: 404, body: { error: `no existe el operador ${operadorId}` } };
  }

  const pin = generarPin(() => randomInt(10000));
  const pinHash = await bcrypt.hash(pin, RONDAS_BCRYPT);
  await db.actualizarPinOperador(operadorId, pinHash);

  return { status: 200, body: { pin } };
}
