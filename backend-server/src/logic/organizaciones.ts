// Validación pura del body de POST /organizaciones/resolver-codigo —
// mismo criterio que logic/personas.ts (sin I/O, ver test/organizaciones.test.ts).

import type { PayloadResolverCodigoOrgHttp } from "../types.js";
import type { ResultadoValidacion } from "./personas.js";

function esStringNoVacio(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validarResolverCodigoOrg(body: unknown): ResultadoValidacion<PayloadResolverCodigoOrgHttp> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body debe ser un objeto JSON" };
  const b = body as Record<string, unknown>;
  if (!esStringNoVacio(b.codigo)) return { ok: false, error: "codigo es obligatorio" };
  // Mismo criterio que codigos_acceso.codigo (ver validarCanjearCodigo)
  // — mayúsculas y sin espacios, no importa cómo lo haya tipeado/pegado
  // quien lo usa.
  return { ok: true, payload: { codigo: (b.codigo as string).trim().toUpperCase() } };
}
