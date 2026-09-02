// Wrapper mínimo para llamar a backend-server desde el teléfono — todos
// los endpoints de alta/registro (POST /personas/reclamar,
// /autoregistro, /canjear-codigo, /push-token) y de confirmación
// (POST /confirmaciones) viven acá porque necesitan lógica de negocio
// del lado del servidor (rate limiting, service_role, publicar por MQTT
// según corresponda) — todo lo demás de esta app lee directo contra
// Supabase (ver lib/supabase.ts). Mismo criterio que
// frontend-web/src/lib/backend.ts.

import { supabase } from "./supabase";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export interface RespuestaBackend<T> {
  status: number;
  body: T;
}

/**
 * `T` es la forma esperada del body en el caso de éxito — en un error
 * (4xx/5xx) el backend siempre responde `{ error: string }`, así que el
 * caller debería chequear `status` antes de asumir la forma de `body`.
 */
export async function llamarBackend<T = unknown>(
  path: string,
  opciones: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = { method: "GET" }
): Promise<RespuestaBackend<T | { error: string }>> {
  if (!BACKEND_URL) {
    throw new Error("Falta EXPO_PUBLIC_BACKEND_URL — copiar .env.example a .env y completar.");
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: opciones.method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  });
  const body = (await res.json()) as T | { error: string };
  return { status: res.status, body };
}
