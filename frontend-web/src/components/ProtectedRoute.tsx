import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, operador, cargando } = useAuth();

  // `session === undefined` = todavía no se resolvió si hay sesión
  // guardada o no (primer render) — esperar antes de decidir, para no
  // mandar a /login a alguien que en realidad ya tenía sesión.
  if (session === undefined || cargando) return null;
  if (!session || !operador) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
