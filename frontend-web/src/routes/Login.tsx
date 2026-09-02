import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import "./Login.css";

export function Login() {
  const { session, operador, cargando, error, iniciarSesion } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorLocal, setErrorLocal] = useState("");

  // Ya hay sesión con operador resuelto (login previo, o se acaba de
  // resolver tras un submit) — no tiene sentido mostrar el form de nuevo.
  if (session && operador) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorLocal("");
    setEnviando(true);
    const resultado = await iniciarSesion(email.trim(), password);
    setEnviando(false);
    if (!resultado.ok) setErrorLocal(resultado.error);
    // Si ok, el AuthProvider resuelve `operador` de forma reactiva y el
    // <Navigate> de arriba se dispara solo en el próximo render.
  }

  const mensajeError = errorLocal || error || "";

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="lb-mark">RE</div>
          <div className="lb-org">Emergencias Refinería</div>
          <div className="lb-sub">Acceso Frontend Web</div>
        </div>
        <form className="field-group" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="inEmail">Email</label>
            <input
              id="inEmail"
              type="email"
              placeholder="ej. admin@empresa.com"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="inPass">Contraseña</label>
            <input
              id="inPass"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="login-submit" type="submit" disabled={enviando || cargando}>
            {enviando ? "Ingresando…" : "Ingresar"}
          </button>
          <div className="login-err">{mensajeError}</div>
        </form>
        <div className="login-foot">
          Login a nivel Organización — separado del PIN de 4 dígitos que se usa en la Consola Disparadora. Qué ves adentro depende de
          tu rol y tu alcance de sitio(s). Solo para administradores activos.
        </div>
      </div>
    </div>
  );
}
