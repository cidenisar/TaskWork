// Pantallas todavía no construidas (Accountability en vivo, Panorama de
// Sitios, Administración de Operadores, etc. — ver ROADMAP.md en la raíz
// del repo). Este stub deja el flujo de login + selector de sitio
// navegable de punta a punta mientras esas pantallas se van armando una
// por una.

import { Topbar } from "../components/Topbar";
import "./SelectorSitio.css";

export function Placeholder({ titulo, nota }: { titulo: string; nota: string }) {
  return (
    <div className="app">
      <Topbar titulo={titulo} />
      <main>
        <div className="empty">{nota}</div>
      </main>
    </div>
  );
}
