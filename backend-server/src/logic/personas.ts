// Validación pura de los tres bodies de alta de personas desde Mobile —
// sin I/O, mismo criterio que el resto de src/logic/ (ver
// test/personas.test.ts). Los handlers (src/handlers/personas.ts)
// deciden auth/padrón/persistencia; esto solo confirma la forma del dato.

import type {
  PayloadReclamarPersonaHttp,
  PayloadAutoregistroHttp,
  PayloadCanjearCodigoHttp,
  PayloadActualizarPushTokenHttp,
} from "../types.js";

function esStringNoVacio(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function esStringONull(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || typeof v === "string";
}

export type ResultadoValidacion<T> = { ok: true; payload: T } | { ok: false; error: string };

export function validarReclamarPersona(body: unknown): ResultadoValidacion<PayloadReclamarPersonaHttp> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body debe ser un objeto JSON" };
  const b = body as Record<string, unknown>;
  if (!esStringNoVacio(b.legajo)) return { ok: false, error: "legajo es obligatorio" };
  if (!esStringNoVacio(b.dni)) return { ok: false, error: "dni es obligatorio" };
  return { ok: true, payload: { legajo: (b.legajo as string).trim(), dni: (b.dni as string).trim() } };
}

export function validarAutoregistro(body: unknown): ResultadoValidacion<PayloadAutoregistroHttp> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body debe ser un objeto JSON" };
  const b = body as Record<string, unknown>;
  if (!esStringNoVacio(b.nombre)) return { ok: false, error: "nombre es obligatorio" };
  if (!esStringNoVacio(b.dni)) return { ok: false, error: "dni es obligatorio" };
  if (!esStringONull(b.legajo)) return { ok: false, error: "legajo debe ser string o null" };
  if (!esStringNoVacio(b.telefono)) return { ok: false, error: "telefono es obligatorio" };
  if (!esStringNoVacio(b.sitioId)) return { ok: false, error: "sitioId es obligatorio" };
  return {
    ok: true,
    payload: {
      nombre: (b.nombre as string).trim(),
      dni: (b.dni as string).trim(),
      legajo: b.legajo ? (b.legajo as string).trim() : null,
      telefono: (b.telefono as string).trim(),
      sitioId: b.sitioId as string,
    },
  };
}

export function validarCanjearCodigo(body: unknown): ResultadoValidacion<PayloadCanjearCodigoHttp> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body debe ser un objeto JSON" };
  const b = body as Record<string, unknown>;
  if (!esStringNoVacio(b.codigo)) return { ok: false, error: "codigo es obligatorio" };
  if (!esStringNoVacio(b.nombre)) return { ok: false, error: "nombre es obligatorio" };
  if (!esStringNoVacio(b.telefono)) return { ok: false, error: "telefono es obligatorio" };
  if (!esStringONull(b.dni)) return { ok: false, error: "dni debe ser string o null" };
  return {
    ok: true,
    payload: {
      // Mismo formato del wireframe ("RF-7K2M-9X") — mayúsculas y sin
      // espacios, para que no importe cómo lo haya tipeado o pegado la
      // persona.
      codigo: (b.codigo as string).trim().toUpperCase(),
      nombre: (b.nombre as string).trim(),
      telefono: (b.telefono as string).trim(),
      dni: b.dni ? (b.dni as string).trim() : null,
    },
  };
}

export function validarActualizarPushToken(body: unknown): ResultadoValidacion<PayloadActualizarPushTokenHttp> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body debe ser un objeto JSON" };
  const b = body as Record<string, unknown>;
  if (!esStringNoVacio(b.pushToken)) return { ok: false, error: "pushToken es obligatorio" };
  return { ok: true, payload: { pushToken: (b.pushToken as string).trim() } };
}
