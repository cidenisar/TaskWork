// Sesión de Mobile — a diferencia de Frontend Web (login real con
// email/contraseña), acá no hay ninguna pantalla de login: al abrir la
// app por primera vez se crea una sesión anónima de Supabase Auth sola
// (`signInAnonymously()`, confirmado habilitado en el proyecto real,
// 2026-08-30) y se guarda en el dispositivo (AsyncStorage, ver
// lib/supabase.ts) — la próxima vez que se abre la app, la sesión ya
// existe. Esa sesión anónima es la identidad real del dispositivo: los
// tres endpoints de registro (ver lib/registro.ts) solo VINCULAN o
// CREAN la fila de `personas` que le corresponde, nunca crean una
// cuenta nueva de Auth.
//
// Una vez que la sesión tiene una `personas` vinculada (RLS
// `personas_self_read`, ver backend-server/README.md), esta fila es la
// fuente de verdad de "quién sos" en toda la app — nombre, estado
// (activo/pendiente_aprobacion/rechazado), sitio.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type EstadoPersona = "activo" | "de_baja" | "vencido" | "pendiente_aprobacion" | "rechazado";

export interface PersonaPropia {
  id: string;
  organizacionId: string;
  sitioId: string | null;
  nombre: string;
  estado: EstadoPersona;
  pushToken: string | null;
}

interface AuthContextValue {
  /** `undefined` mientras arranca la sesión anónima (evita parpadeos). */
  session: Session | null | undefined;
  /** `null` = sesión sin ninguna persona vinculada todavía (falta pasar por Reclamar/Autoregistro/Código). */
  persona: PersonaPropia | null;
  cargando: boolean;
  error: string | null;
  /** Vuelve a leer la persona vinculada — llamar después de reclamar/autoregistrarse/canjear un código, o para refrescar el estado (aprobación pendiente). */
  refrescarPersona: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolverPersona(authUserId: string): Promise<PersonaPropia | null> {
  const { data, error } = await supabase
    .from("personas")
    .select("id, organizacion_id, sitio_id, nombre, estado, push_token")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    organizacionId: data.organizacion_id,
    sitioId: data.sitio_id,
    nombre: data.nombre,
    estado: data.estado,
    pushToken: data.push_token,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [persona, setPersona] = useState<PersonaPropia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargarPersonaDeSesion(s: Session | null) {
    if (!s) {
      setPersona(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      setPersona(await resolverPersona(s.user.id));
      setCargando(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado resolviendo la cuenta.");
      setCargando(false);
    }
  }

  useEffect(() => {
    let cancelado = false;

    async function arrancar() {
      const { data } = await supabase.auth.getSession();
      let s = data.session;
      if (!s) {
        // Primera vez que se abre la app en este dispositivo — la
        // identidad del dispositivo nace acá, sin ninguna pantalla.
        const { data: anon, error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr) {
          if (!cancelado) {
            setError(`No se pudo iniciar la sesión del dispositivo: ${anonErr.message}`);
            setCargando(false);
          }
          return;
        }
        s = anon.session;
      }
      if (cancelado) return;
      setSession(s);
      await cargarPersonaDeSesion(s);
    }

    void arrancar();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelado) return;
      setSession(s);
      void cargarPersonaDeSesion(s);
    });

    return () => {
      cancelado = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function refrescarPersona() {
    if (!session) return;
    await cargarPersonaDeSesion(session);
  }

  return <AuthContext.Provider value={{ session, persona, cargando, error, refrescarPersona }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() usado fuera de <AuthProvider>");
  return ctx;
}
