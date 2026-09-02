// Cliente de Supabase del lado del teléfono — SIEMPRE con la clave
// pública (anon), nunca service_role (esa vive solo en backend-server).
// Mismo criterio que frontend-web/src/lib/supabase.ts, adaptado a
// React Native: sesión persistida en AsyncStorage (no hay localStorage)
// y el polyfill de URL que supabase-js necesita en Hermes/RN.
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Falla rápido y claro en vez de que cada pantalla explote más tarde
  // con un error de red críptico — mismo criterio que crearClienteDb()
  // del lado del backend y supabase.ts de Frontend Web.
  throw new Error("Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copiar .env.example a .env y completar.");
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
