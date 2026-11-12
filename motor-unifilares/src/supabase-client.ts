/**
 * Cliente de Supabase compartido por los stores de este servicio
 * (ejemplos-store.ts, jobs-store.ts, medicion-store.ts, storage.ts) — SIEMPRE
 * con la service role key, nunca una key pública: las tablas propias de
 * motor-unifilares tienen RLS habilitado sin políticas, y el acceso directo
 * a tablero_mediciones (medicion-store.ts) y al bucket de storage de
 * informes-app también necesita bypasear las políticas pensadas para el
 * usuario logueado, no para este servicio.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function clienteSupabase(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno (ver README.md).");
  }
  cliente = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  return cliente;
}
