import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import "./Topbar.css";

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  return partes
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar({ titulo, extra }: { titulo: string; extra?: ReactNode }) {
  const { operador, cerrarSesion } = useAuth();
  if (!operador) return null;

  const alcanceTxt = operador.alcanceTipo === "organizacion" ? "toda la organización" : "sitio asignado";

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">RE</div>
        <div className="brand-text">
          <div className="p1">Emergencias Refinería</div>
          <div className="p2">Frontend Web</div>
        </div>
      </div>
      <h1>{titulo}</h1>
      {/* Nav mínima — hasta que haya suficientes pantallas para justificar un rail lateral, ver ROADMAP.md */}
      <nav className="topbar-nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "on" : "")}>
          Sitios
        </NavLink>
        <NavLink to="/operadores" className={({ isActive }) => (isActive ? "on" : "")}>
          Operadores
        </NavLink>
        <NavLink to="/personas/pendientes" className={({ isActive }) => (isActive ? "on" : "")}>
          Pendientes
        </NavLink>
      </nav>
      {extra}
      <div className="scope-chip">
        <span className="av">{iniciales(operador.nombre)}</span>
        <b>{operador.nombre}</b>
        <span className="role">· Admin · {alcanceTxt}</span>
      </div>
      <button className="logout-link" type="button" onClick={() => void cerrarSesion()}>
        Cerrar sesión
      </button>
    </div>
  );
}
