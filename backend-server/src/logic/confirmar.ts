// Validación pura del body de `POST /confirmaciones` (Mobile → Backend) —
// sin I/O, mismo criterio que el resto de src/logic/ (ver test/confirmar.test.ts).
// El handler (src/handlers/confirmaciones.ts) es quien decide si la
// persona/evento existen de verdad; esto solo confirma la forma del dato.

import type { PayloadConfirmacionHttp } from "../types.js";

export type ResultadoValidacion =
  | { ok: true; payload: PayloadConfirmacionHttp }
  | { ok: false; error: string };

function esStringNoVacio(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function esStringONull(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || typeof v === "string";
}

function esNumeroONull(v: unknown): v is number | null | undefined {
  return v === null || v === undefined || typeof v === "number";
}

export function validarConfirmacion(body: unknown): ResultadoValidacion {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body debe ser un objeto JSON" };
  }
  const b = body as Record<string, unknown>;

  if (!esStringNoVacio(b.eventoId)) {
    return { ok: false, error: "eventoId es obligatorio" };
  }
  if (b.estado !== "ok" && b.estado !== "ayuda") {
    return { ok: false, error: 'estado debe ser "ok" o "ayuda"' };
  }
  if (!esStringONull(b.puntoId)) {
    return { ok: false, error: "puntoId debe ser string o null" };
  }
  if (!esStringONull(b.notaAyuda)) {
    return { ok: false, error: "notaAyuda debe ser string o null" };
  }
  if (!esNumeroONull(b.ubicacionLat) || !esNumeroONull(b.ubicacionLng)) {
    return { ok: false, error: "ubicacionLat/ubicacionLng deben ser number o null" };
  }

  return {
    ok: true,
    payload: {
      eventoId: b.eventoId,
      estado: b.estado,
      puntoId: (b.puntoId as string | null) ?? null,
      notaAyuda: (b.notaAyuda as string | null) ?? null,
      ubicacionLat: (b.ubicacionLat as number | null) ?? null,
      ubicacionLng: (b.ubicacionLng as number | null) ?? null,
    },
  };
}

/**
 * Extrae el token de un header `Authorization: Bearer <token>` — pura,
 * separada de la verificación real del JWT (esa sí necesita I/O, ver
 * Db.verificarJwtMobile). Devuelve null si el header falta o no tiene la
 * forma esperada.
 */
export function extraerBearerToken(authorizationHeader: string | undefined | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}
