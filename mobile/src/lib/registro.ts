// Los flujos de alta/vínculo de persona (ver backend-server/README.md,
// "Autoregistro de personas (Mobile)") — todos pasan por backend-server
// (necesitan lógica de negocio del lado del servidor: rate limiting,
// atomicidad del cupo de un código, etc.), nunca escritura directa
// contra Supabase.
//
// Autoregistro ("no me encontraron, pido el alta", `POST
// /personas/autoregistro`) queda deliberadamente sin pantalla todavía
// — necesita un `sitioId` real, y no hay forma hoy de que una sesión
// SIN persona vinculada (RLS de `sitios` es admin-only) sepa qué
// sitios existen para elegir. Ver ROADMAP.md para la decisión
// pendiente (app configurada por organización vs. política RLS
// pública vs. código de sitio) antes de construir esa pantalla.

import { llamarBackend } from "./backend";

export interface ResultadoReclamar {
  ok: boolean;
  status: number;
  yaEstabaVinculada?: boolean;
  error?: string;
}

export async function reclamarPersona(legajo: string, dni: string): Promise<ResultadoReclamar> {
  const res = await llamarBackend<{ id: string; yaEstabaVinculada: boolean }>("/personas/reclamar", {
    method: "POST",
    body: { legajo, dni },
  });
  if (res.status === 200 && "id" in res.body) {
    return { ok: true, status: res.status, yaEstabaVinculada: res.body.yaEstabaVinculada };
  }
  return { ok: false, status: res.status, error: "error" in res.body ? res.body.error : "Error inesperado." };
}

export interface ResultadoCanjearCodigo {
  ok: boolean;
  status: number;
  error?: string;
}

export async function canjearCodigo(codigo: string, nombre: string, telefono: string, dni: string | null): Promise<ResultadoCanjearCodigo> {
  const res = await llamarBackend<{ id: string; estado: "activo" }>("/personas/canjear-codigo", {
    method: "POST",
    body: { codigo, nombre, telefono, dni },
  });
  if (res.status === 201) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: "error" in res.body ? res.body.error : "Error inesperado." };
}

export async function actualizarPushToken(pushToken: string): Promise<{ ok: boolean; error?: string }> {
  const res = await llamarBackend<{ ok: true }>("/personas/push-token", { method: "POST", body: { pushToken } });
  if (res.status === 200) return { ok: true };
  return { ok: false, error: "error" in res.body ? res.body.error : "Error inesperado." };
}
