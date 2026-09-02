// Contexto de autenticación — sesión de Supabase Auth + la fila de
// `operadores` vinculada. Frontend Web es solo para admins activos (ver
// backend-server/README.md, "RLS: auditoría de seguridad..." — decisión
// tomada con el usuario 2026-08-29): un operador rol:"operador" nunca
// tiene login web, se autentica con PIN directo en la consola física.
//
// Por eso, si el login de Supabase Auth funciona pero no aparece
// ninguna fila de `operadores` vinculada (o esa fila no es admin+activo,
// que en la práctica es indistinguible por RLS — `org_isolation` exige
// las dos cosas para dejar leer la fila), esto se trata como "esta
// cuenta no tiene acceso a Frontend Web" y cierra la sesión de
// inmediato en vez de dejarla colgada, autenticada pero sin poder hacer
// nada.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AlcanceTipo = "organizacion" | "sitio";

export interface Operador {
  id: string;
  organizacionId: string;
  nombre: string;
  legajo: string;
  alcanceTipo: AlcanceTipo;
}

interface AuthContextValue {
  /** `undefined` mientras se resuelve la sesión inicial (evita un parpadeo a /login antes de confirmar que no hay sesión). */
  session: Session | null | undefined;
  operador: Operador | null;
  cargando: boolean;
  error: string | null;
  iniciarSesion: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolverOperador(authUserId: string): Promise<Operador | null> {
  const { data, error } = await supabase
    .from("operadores")
    .select("id, organizacion_id, nombre, legajo, alcance_tipo")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  // Un error acá (no "sin filas", sino un error real de red/RLS raro) no
  // debería leerse como "no sos admin" — se propaga aparte.
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    organizacionId: data.organizacion_id,
    nombre: data.nombre,
    legajo: data.legajo,
    alcanceTipo: data.alcance_tipo,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function cargarOperadorDeSesion(s: Session | null) {
      if (!s) {
        setOperador(null);
        setCargando(false);
        return;
      }
      setCargando(true);
      try {
        const op = await resolverOperador(s.user.id);
        if (cancelado) return;
        if (!op) {
          // Login válido pero sin (o sin acceso a) fila de operador — no
          // dejar una sesión de Auth colgada sin nada que hacer con ella.
          setError("Esta cuenta no tiene acceso a Frontend Web. Consultá con un administrador.");
          await supabase.auth.signOut();
          setOperador(null);
          setSession(null);
          setCargando(false);
          return;
        }
        setOperador(op);
        setCargando(false);
      } catch (err) {
        if (cancelado) return;
        setError(err instanceof Error ? err.message : "Error inesperado resolviendo la cuenta.");
        setCargando(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelado) return;
      setSession(data.session);
      void cargarOperadorDeSesion(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (cancelado) return;
      setSession(s);
      void cargarOperadorDeSesion(s);
    });

    return () => {
      cancelado = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function iniciarSesion(email: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      const msg = signInError.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : signInError.message;
      return { ok: false, error: msg };
    }
    return { ok: true };
  }

  async function cerrarSesion(): Promise<void> {
    await supabase.auth.signOut();
    setOperador(null);
  }

  return (
    <AuthContext.Provider value={{ session, operador, cargando, error, iniciarSesion, cerrarSesion }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() usado fuera de <AuthProvider>");
  return ctx;
}
