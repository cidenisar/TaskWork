// Ver Cowork "Panorama de Sitios". Los sitios de la organización a la
// vez, en modo solo monitoreo — reusa getEventoActivo/getContadores de
// lib/accountability.ts y listarConsolas de lib/consolas.ts (misma
// pregunta que Accountability en vivo, para todos los sitios a la vez).
//
// Solo para admins de alcance "organización" — un admin de alcance
// "sitio" ni siquiera ve el CTA hacia acá en el Selector de Sitio, pero
// nada le impide teclear /panorama directo; RLS técnicamente lo
// dejaría (org_isolation no distingue alcance_tipo, ver
// backend-server/README.md), así que el guardado se hace acá, a nivel
// de aplicación — coherente con que "tu alcance" es un límite de
// producto, no (solo) de RLS.
//
// Deliberadamente no construido: el "mapa esquemático" ilustrativo del
// wireframe (posiciones x/y inventadas, no ligadas a las coordenadas
// reales de sitios.lat/lng) y el texto de "último simulacro" para los
// sitios sin evento activo (eso es terreno de la pantalla de Historial,
// todavía sin construir — ver ROADMAP.md).

import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listarPanorama, type SitioPanorama } from "../lib/panorama";
import { Topbar } from "../components/Topbar";
import "./SelectorSitio.css";
import "./Panorama.css";

export function Panorama() {
  const { operador } = useAuth();
  const navigate = useNavigate();
  const [sitios, setSitios] = useState<SitioPanorama[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!operador || operador.alcanceTipo !== "organizacion") return;
    let cancelado = false;
    listarPanorama(operador.organizacionId)
      .then((s) => {
        if (!cancelado) setSitios(s);
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudo cargar el panorama.");
      });
    return () => {
      cancelado = true;
    };
  }, [operador]);

  if (!operador) return null;
  if (operador.alcanceTipo !== "organizacion") return <Navigate to="/" replace />;

  return (
    <div className="app">
      <Topbar
        titulo="Panorama de Sitios"
        extra={
          <span className="monitor-badge">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l2.5 2.5" />
            </svg>
            Solo monitoreo
          </span>
        }
      />
      <main>
        <div className="intro">
          <span className="eyebrow">Vista consolidada · Alcance: toda la organización</span>
          <p>
            Todos los sitios de la organización a la vez. Esta pantalla no dispara ni cierra eventos de ningún sitio — cada uno se sigue
            disparando únicamente con el botón físico de su propia consola. Entrá a un sitio para ver su detalle completo de
            accountability.
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar: {error}</div>}
        {!error && sitios === null && <div className="empty">Cargando…</div>}
        {!error && sitios && sitios.length === 0 && <div className="empty">Esta organización no tiene ningún sitio configurado todavía.</div>}

        {!error && sitios && sitios.length > 0 && (
          <div className="sites-grid">
            {sitios.map((s) => (
              <div key={s.id} className={s.eventoActivo ? "site-card active-event" : "site-card"} onClick={() => navigate(`/sitio/${s.id}`)}>
                <div className="sc-top">
                  <div className="sc-name">{s.nombre}</div>
                  {s.eventoActivo ? <span className="status-pill live">Evento activo</span> : <span className="status-pill quiet">Sin novedades</span>}
                </div>
                {s.eventoActivo ? (
                  <div className="sc-event">
                    <div className="ev-type">{s.eventoActivo.tipoNombre}</div>
                    <div className="ev-meta">Modo {s.eventoActivo.modo === "real" ? "real" : "simulacro"}</div>
                    <div className="sc-kpis">
                      <div className="k">
                        <span className="kv num">{s.eventoActivo.totales.total}</span>
                        <span className="kl">Notif.</span>
                      </div>
                      <div className="k ok">
                        <span className="kv num">{s.eventoActivo.totales.ok}</span>
                        <span className="kl">OK</span>
                      </div>
                      <div className="k help">
                        <span className="kv num">{s.eventoActivo.totales.ayuda}</span>
                        <span className="kl">Ayuda</span>
                      </div>
                      <div className="k pending">
                        <span className="kv num">{s.eventoActivo.totales.pendiente}</span>
                        <span className="kl">Pend.</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="sc-quiet">Sin eventos activos ahora mismo.</div>
                )}
                <div className="sc-foot">
                  <span className="sc-consolas">
                    Consolas: <b>{s.consolasOnline}/{s.consolasTotal}</b> en línea
                  </span>
                  <span className="sc-cta">
                    Ver sitio
                    <svg viewBox="0 0 24 24">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
