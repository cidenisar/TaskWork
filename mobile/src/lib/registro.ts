// Los flujos de alta/vínculo de persona (ver backend-server/README.md,
// "Autoregistro de personas (Mobile)") — todos pasan por backend-server
// (necesitan lógica de negocio del lado del servidor: rate limiting,
// atomicidad del cupo de un código, etc.), nunca escritura directa
// contra Supabase.

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

// --- Autoregistro ("no me encontraron, pido el alta") — ver
// backend-server/README.md, "Autoregistro: código de organización"
// para el porqué del paso extra del código: `sitios` es admin-only por
// RLS, así que antes de tener una `personas` vinculada, la app no
// tiene otra forma de saber qué sitios existen para el selector. ---

export interface SitioOpcion {
  id: string;
  nombre: string;
}

export interface ResultadoResolverCodigoOrg {
  ok: boolean;
  organizacionNombre?: string;
  sitios?: SitioOpcion[];
  error?: string;
}

export async function resolverCodigoOrganizacion(codigo: string): Promise<ResultadoResolverCodigoOrg> {
  const res = await llamarBackend<{ organizacionId: string; organizacionNombre: string; sitios: SitioOpcion[] }>(
    "/organizaciones/resolver-codigo",
    { method: "POST", body: { codigo } }
  );
  if (res.status === 200 && "organizacionId" in res.body) {
    return { ok: true, organizacionNombre: res.body.organizacionNombre, sitios: res.body.sitios };
  }
  return { ok: false, error: "error" in res.body ? res.body.error : "Error inesperado." };
}

export interface ResultadoAutoregistro {
  ok: boolean;
  error?: string;
}

export async function autoregistrar(nombre: string, dni: string, legajo: string | null, telefono: string, sitioId: string): Promise<ResultadoAutoregistro> {
  const res = await llamarBackend<{ id: string; estado: "pendiente_aprobacion" }>("/personas/autoregistro", {
    method: "POST",
    body: { nombre, dni, legajo, telefono, sitioId },
  });
  if (res.status === 201) return { ok: true };
  return { ok: false, error: "error" in res.body ? res.body.error : "Error inesperado." };
}
