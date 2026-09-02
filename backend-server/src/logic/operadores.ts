// Validación pura del body de `POST /operadores` + generación del PIN —
// sin I/O, mismo criterio que el resto de src/logic/ (ver
// test/operadores.test.ts). El handler (src/handlers/operadores.ts)
// decide auth/organización/persistencia; esto solo confirma la forma
// del dato y produce un PIN nuevo.

import type { PayloadCrearOperadorHttp, RolOperador, AlcanceTipo } from "../types.js";

export type ResultadoValidacionOperador =
  | { ok: true; payload: PayloadCrearOperadorHttp }
  | { ok: false; error: string };

function esStringNoVacio(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function esStringONull(v: unknown): v is string | null | undefined {
  return v === null || v === undefined || typeof v === "string";
}

function esArrayDeStringsNoVacios(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string" && x.length > 0);
}

// Chequeo deliberadamente laxo (no es el punto donde se decide si el
// email es entregable) — Supabase Auth es quien valida/rechaza en
// serio al invitar; esto solo atrapa un typo evidente antes de gastar
// esa llamada.
const FORMA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validarCrearOperador(body: unknown): ResultadoValidacionOperador {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body debe ser un objeto JSON" };
  }
  const b = body as Record<string, unknown>;

  if (!esStringNoVacio(b.nombre)) {
    return { ok: false, error: "nombre es obligatorio" };
  }
  if (!esStringONull(b.legajo)) {
    return { ok: false, error: "legajo debe ser string o null" };
  }
  if (b.rol !== "operador" && b.rol !== "admin") {
    return { ok: false, error: 'rol debe ser "operador" o "admin"' };
  }
  if (b.alcanceTipo !== "sitio" && b.alcanceTipo !== "organizacion") {
    return { ok: false, error: 'alcanceTipo debe ser "sitio" o "organizacion"' };
  }
  const alcanceTipo = b.alcanceTipo as AlcanceTipo;

  if (alcanceTipo === "sitio") {
    if (!esArrayDeStringsNoVacios(b.sitiosIds) || b.sitiosIds.length === 0) {
      return { ok: false, error: 'sitiosIds es obligatorio y no puede estar vacío cuando alcanceTipo es "sitio"' };
    }
  } else if (b.sitiosIds !== undefined && !(Array.isArray(b.sitiosIds) && b.sitiosIds.length === 0)) {
    return { ok: false, error: 'sitiosIds debe venir vacío u omitido cuando alcanceTipo es "organizacion"' };
  }

  if (b.email !== undefined && b.email !== null) {
    if (typeof b.email !== "string" || !FORMA_EMAIL.test(b.email)) {
      return { ok: false, error: "email tiene un formato inválido" };
    }
  }

  return {
    ok: true,
    payload: {
      nombre: (b.nombre as string).trim(),
      legajo: (b.legajo as string | null) ?? null,
      rol: b.rol as RolOperador,
      alcanceTipo,
      sitiosIds: alcanceTipo === "sitio" ? (b.sitiosIds as string[]) : [],
      email: (b.email as string | null) ?? null,
    },
  };
}

/**
 * PIN de 4 dígitos — mismo formato que espera el teclado numérico de
 * consola-pi (`pinBuffer.length >= 4`, ver consola-pi/src/pantalla/index.html).
 * `azar` se inyecta para poder testear determinísticamente; en
 * producción el handler pasa `() => randomInt(10000)` (node:crypto,
 * criptográficamente fuerte — es el PIN que habilita una emergencia
 * real, no algo para generar con `Math.random`).
 */
export function generarPin(azar: () => number): string {
  const n = azar();
  return Math.abs(Math.trunc(n)).toString().padStart(4, "0").slice(-4);
}
