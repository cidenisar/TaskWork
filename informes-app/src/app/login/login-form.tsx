"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { ErrorNote } from "@/components/notes";

const initialState: LoginState = { error: null };

export function LoginForm({ next, desactivado }: { next: string; desactivado?: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="card">
      <input type="hidden" name="next" value={next} />
      {desactivado && (
        <div style={{ marginBottom: 14 }}>
          <ErrorNote>Tu sesión se cerró porque un Administrador desactivó esta cuenta.</ErrorNote>
        </div>
      )}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          type="text"
          id="email"
          name="email"
          placeholder="tu.nombre@empresa.com"
          autoComplete="username"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input
          type="password"
          id="password"
          name="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      <button
        type="submit"
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
        disabled={pending}
      >
        {pending ? "Ingresando..." : "Iniciar sesión"}
      </button>
      <div className="hint" style={{ marginTop: 14, textAlign: "center" }}>
        Tu rol (Técnico / Supervisor / Administrador) lo asigna un Administrador desde
        Configuración — no se elige acá.
      </div>
    </form>
  );
}
