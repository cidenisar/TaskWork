"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="card">
      <input type="hidden" name="next" value={next} />
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
      {state.error && <div className="error-note">⚠️ {state.error}</div>}
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
