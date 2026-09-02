import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listarSitiosVisibles, type SitioConEstado } from "../lib/sitios";
import { Topbar } from "../components/Topbar";
import "./SelectorSitio.css";

export function SelectorSitio() {
  const { operador } = useAuth();
  const navigate = useNavigate();
  const [sitios, setSitios] = useState<SitioConEstado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!operador) return;
    let cancelado = false;
    setSitios(null);
    setError(null);
    listarSitiosVisibles(operador)
      .then((s) => {
        if (!cancelado) setSitios(s);
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudo cargar la lista de sitios.");
      });
    return () => {
      cancelado = true;
    };
  }, [operador]);

  if (!operador) return null;

  const titulo = sitios && sitios.length === 1 ? "Entrando a tu sitio" : "Elegí un sitio";

  return (
    <div className="app">
      <Topbar titulo={titulo} />
      <main>
        {error && <div className="empty">No se pudo cargar tus sitios: {error}</div>}
        {!error && sitios === null && <div className="empty">Cargando sitios…</div>}
        {!error && sitios && sitios.length === 0 && (
          <div className="empty">Tu cuenta no tiene ningún sitio asignado todavía. Consultá con un administrador.</div>
        )}
        {!error && sitios && sitios.length === 1 && (
          <div className="single-redirect">
            <div className="sr-eyebrow">Tu alcance es un solo sitio</div>
            <div className="sr-site">{sitios[0].nombre}</div>
            <div className="sr-note">
              Como tu rol solo tiene ese sitio en su alcance, no hace falta elegir — se te lleva directo al Accountability en vivo.
            </div>
            <button className="cta-btn" type="button" onClick={() => navigate(`/sitio/${sitios[0].id}`)}>
              Ir a {sitios[0].nombre} →
            </button>
          </div>
        )}
        {!error && sitios && sitios.length > 1 && (
          <>
            <div className="intro">
              <div className="eyebrow">Login · Frontend Web</div>
              <p>
                Elegí el sitio que querés ver. El dashboard de Accountability muestra el evento de un sitio a la vez — por eso, si tu rol
                tiene más de uno en su alcance, primero elegís cuál.
              </p>
            </div>
            {operador.alcanceTipo === "organizacion" && (
              <div className="panorama-cta">
                <div>
                  <div className="pc-title">Panorama de Sitios</div>
                  <div className="pc-sub">Los {sitios.length} sitios a la vez, en modo solo monitoreo — para tu alcance de organización.</div>
                </div>
                <button type="button" onClick={() => navigate("/panorama")}>
                  Ver panorama →
                </button>
              </div>
            )}
            <div className="sites-grid">
              {sitios.map((s) => (
                <div
                  key={s.id}
                  className={s.eventoActivo ? "site-card active-event" : "site-card"}
                  onClick={() => navigate(`/sitio/${s.id}`)}
                >
                  <div className="sc-top">
                    <div className="sc-name">{s.nombre}</div>
                    {s.eventoActivo ? <span className="status-pill live">Evento real</span> : <span className="status-pill quiet">Sin novedades</span>}
                  </div>
                  <div className="sc-sub">{s.eventoActivo ? s.eventoActivo.tipoNombre : "Sin novedades"}</div>
                  <div className="sc-foot">
                    <span className="sc-cta">
                      Entrar
                      <svg viewBox="0 0 24 24">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
