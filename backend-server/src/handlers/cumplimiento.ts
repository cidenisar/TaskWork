// Handler de `GET /simulacros/cumplimiento` — ver README, "Vista de
// cumplimiento". Requiere JWT de Supabase Auth (mismo mecanismo que
// POST /confirmaciones, ver Db.verificarJwt) pero resuelve a un
// OPERADOR, no a una persona — esto es una vista de gestión/auditoría,
// no algo que use el personal general. Se restringe a rol `admin`: es
// información de cumplimiento de todo el sitio, no algo que cualquier
// operador puntual necesite ver.

import type { Db } from "../lib/db.js";
import { extraerBearerToken } from "../logic/confirmar.js";
import { calcularCumplimiento, type EstadoCumplimiento } from "../logic/cumplimiento.js";

export type ResultadoCumplimiento =
  | { status: 200; body: EstadoCumplimiento[] }
  | { status: 401; body: { error: string } }
  | { status: 403; body: { error: string } };

export async function manejarCumplimiento(
  db: Db,
  authorizationHeader: string | undefined | null,
  sitioIdFiltro: string | null
): Promise<ResultadoCumplimiento> {
  const token = extraerBearerToken(authorizationHeader);
  if (!token) {
    return { status: 401, body: { error: "falta el header Authorization: Bearer <token>" } };
  }
  const authUserId = await db.verificarJwt(token);
  if (!authUserId) {
    return { status: 401, body: { error: "token inválido o expirado" } };
  }
  const operador = await db.getOperadorPorAuthUserId(authUserId);
  if (!operador) {
    return { status: 403, body: { error: "esta cuenta no está vinculada a ningún operador" } };
  }
  if (operador.rol !== "admin") {
    return { status: 403, body: { error: "se requiere rol admin" } };
  }

  const historial = await db.getHistorialSimulacros(operador.organizacionId, sitioIdFiltro);
  return { status: 200, body: calcularCumplimiento(historial) };
}
