// Cliente de Supabase del lado del navegador — SIEMPRE con la clave
// pública (anon), nunca service_role (esa vive solo en backend-server,
// del lado del servidor). Todo lo que esta app puede leer/escribir
// directo contra Supabase pasa por RLS — ver backend-server/README.md,
// "RLS: auditoría de seguridad antes de arrancar Frontend Web" para el
// modelo completo (org_isolation exige rol admin + estado activo).

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falla rápido y claro en vez de que cada pantalla explote más tarde
  // con un error de red críptico — mismo criterio que crearClienteDb()
  // del lado del backend.
  throw new Error("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copiar .env.example a .env y completar.");
}

export const supabase = createClient(url, anonKey);
