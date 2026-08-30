// Handler de POST /organizaciones/resolver-codigo (Mobile → Backend) —
// ver README, "Autoregistro: código de organización". Mismo criterio de
// auth que los otros endpoints de Mobile (cualquier JWT válido,
// incluida una sesión anónima — reusa autenticarSesion de
// handlers/personas.ts en vez de duplicarla).

import type { Db } from "../lib/db.js";
import { autenticarSesion } from "./personas.js";
import { validarResolverCodigoOrg } from "../logic/organizaciones.js";

export type ResultadoResolverCodigoOrg =
  | { status: 400; body: { error: string } }
  | { status: 401; body: { error: string } }
  | { status: 404; body: { error: string } }
  | { status: 200; body: { organizacionId: string; organizacionNombre: string; sitios: { id: string; nombre: string }[] } };

export async function manejarResolverCodigoOrg(
  db: Db,
  authorizationHeader: string | undefined | null,
  rawBody: unknown
): Promise<ResultadoResolverCodigoOrg> {
  const auth = await autenticarSesion(db, authorizationHeader);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const validacion = validarResolverCodigoOrg(rawBody);
  if (!validacion.ok) return { status: 400, body: { error: validacion.error } };

  const organizacion = await db.getOrganizacionPorCodigo(validacion.payload.codigo);
  if (!organizacion) return { status: 404, body: { error: "código de organización inválido" } };

  const sitios = await db.getSitiosDeOrganizacion(organizacion.id);
  return { status: 200, body: { organizacionId: organizacion.id, organizacionNombre: organizacion.nombre, sitios } };
}
