// Ver Cowork "Administración de Puntos de Encuentro". Alta, edición y
// baja son escritura directa contra Supabase (ver lib/puntos.ts) — sin
// coordenadas/mapa, un punto es nombre + descripción/ubicación en texto
// libre, ligado a un sitio.
//
// A diferencia del wireframe (un mapa fijo `SITIOS` con 3 sitios
// hardcodeados), el selector de sitio acá sale de `listarSitiosVisibles`
// — ya filtrado por el alcance real del admin logueado, mismo criterio
// que Panorama y el Selector de Sitio (ver lib/sitios.ts).

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { listarSitiosVisibles, type SitioConEstado } from "../lib/sitios";
import { listarPuntos, crearPunto, actualizarPunto, cambiarEstadoPunto, type PuntoEncuentroFila } from "../lib/puntos";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import "./Puntos.css";

interface FormularioDrawer {
  editingId: string | null;
  nombre: string;
  descripcion: string;
}

export function Puntos() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [sitios, setSitios] = useState<SitioConEstado[] | null>(null);
  const [sitioId, setSitioId] = useState<string>("");
  const [puntos, setPuntos] = useState<PuntoEncuentroFila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBajaId, setConfirmandoBajaId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FormularioDrawer | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [accionEnCursoId, setAccionEnCursoId] = useState<string | null>(null);

  useEffect(() => {
    if (!operador) return;
    (async () => {
      try {
        const lista = await listarSitiosVisibles(operador);
        setSitios(lista);
        if (lista.length > 0) setSitioId((actual) => actual || lista[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la lista de sitios.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  async function cargarPuntos(id: string) {
    setError(null);
    setConfirmandoBajaId(null);
    try {
      setPuntos(await listarPuntos(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los puntos de encuentro.");
    }
  }

  useEffect(() => {
    if (!sitioId) return;
    setPuntos(null);
    void cargarPuntos(sitioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioId]);

  const sitioNombre = useMemo(() => sitios?.find((s) => s.id === sitioId)?.nombre ?? "", [sitios, sitioId]);
  const activos = puntos ? puntos.filter((p) => p.activo).length : 0;

  if (!operador) return null;

  function abrirAlta() {
    setDrawer({ editingId: null, nombre: "", descripcion: "" });
  }
  function abrirEdicion(p: PuntoEncuentroFila) {
    setDrawer({ editingId: p.id, nombre: p.nombre, descripcion: p.descripcion ?? "" });
  }

  async function guardarDrawer() {
    if (!drawer) return;
    const nombre = drawer.nombre.trim();
    if (!nombre) {
      mostrar("Falta el nombre del punto.");
      return;
    }
    setGuardando(true);
    try {
      if (drawer.editingId) {
        await actualizarPunto(drawer.editingId, nombre, drawer.descripcion.trim());
        mostrar("Cambios guardados.");
      } else {
        await crearPunto(sitioId, nombre, drawer.descripcion.trim());
        mostrar(`"${nombre}" agregado.`);
      }
      setDrawer(null);
      await cargarPuntos(sitioId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando los cambios.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBaja(p: PuntoEncuentroFila) {
    setAccionEnCursoId(p.id);
    try {
      await cambiarEstadoPunto(p.id, false);
      setConfirmandoBajaId(null);
      mostrar(`"${p.nombre}" dado de baja.`);
      await cargarPuntos(sitioId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado dando de baja al punto.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  async function reactivar(p: PuntoEncuentroFila) {
    setAccionEnCursoId(p.id);
    try {
      await cambiarEstadoPunto(p.id, true);
      mostrar(`"${p.nombre}" reactivado.`);
      await cargarPuntos(sitioId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado reactivando el punto.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  return (
    <div className="app">
      <Topbar
        titulo="Puntos de Encuentro"
        extra={
          sitios && sitios.length > 0 ? (
            <div className="site-picker">
              <label htmlFor="selSitio">Sitio</label>
              <select id="selSitio" value={sitioId} onChange={(e) => setSitioId(e.target.value)}>
                {sitios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : undefined
        }
      />
      <main>
        <div className="intro">
          <div className="eyebrow">Administración · configuración de planta</div>
          <p>
            Alta, edición y baja de los puntos de encuentro de <b>{sitioNombre || "…"}</b>. Es configuración permanente, independiente de que haya o
            no una emergencia en curso — no confundir con el botón "Deshabilitar punto" del dashboard de Accountability en vivo (ver nota de abajo).
          </p>
        </div>

        <div className="info-box">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <div>
            <b>Dos cosas distintas que se llaman parecido:</b> "Dar de baja" acá borra el punto de la lista para siempre (alta/baja de
            configuración). "Deshabilitar", en el dashboard de Accountability durante un evento, es temporal — dura lo que dura ese evento y vuelve
            a estar disponible en el próximo.
          </div>
        </div>

        {error && <div className="empty">No se pudo cargar: {error}</div>}

        {!error && sitios !== null && sitios.length === 0 && <div className="empty">No tenés ningún sitio asignado.</div>}

        {!error && sitios !== null && sitios.length > 0 && puntos === null && <div className="empty">Cargando puntos de encuentro…</div>}

        {!error && sitios !== null && sitios.length > 0 && puntos !== null && (
          <>
            <div className="toolbar">
              <div className="tb-count">
                <b>{activos}</b> de {puntos.length} puntos activos en este sitio
              </div>
              <button className="btn-primary" type="button" onClick={abrirAlta}>
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Agregar punto
              </button>
            </div>

            {puntos.length === 0 ? (
              <div className="empty">Este sitio todavía no tiene puntos de encuentro cargados.</div>
            ) : (
              <div className="list">
                {puntos.map((p) => {
                  if (confirmandoBajaId === p.id) {
                    return (
                      <div className="point-row" key={p.id}>
                        <div className="confirm-row">
                          <div className="cr-text">
                            ¿Dar de baja <b>{p.nombre}</b>? Deja de estar disponible para elegir en futuros eventos — esto no borra el historial de
                            eventos pasados.
                          </div>
                          <div className="cr-actions">
                            <button className="btn-ghost" type="button" onClick={() => setConfirmandoBajaId(null)}>
                              Cancelar
                            </button>
                            <button className="btn-danger" type="button" disabled={accionEnCursoId === p.id} onClick={() => void confirmarBaja(p)}>
                              Dar de baja
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className={p.activo ? "point-row" : "point-row inactive"} key={p.id}>
                      <div className="pr-main">
                        <div className="pr-name">
                          {p.nombre}
                          <span className={p.activo ? "status-pill active" : "status-pill inactive"}>{p.activo ? "Activo" : "Dado de baja"}</span>
                        </div>
                        {p.descripcion && <div className="pr-desc">{p.descripcion}</div>}
                      </div>
                      <div className="row-actions">
                        {p.activo ? (
                          <button className="icon-btn" type="button" onClick={() => setConfirmandoBajaId(p.id)}>
                            <svg viewBox="0 0 24 24">
                              <path d="M12 2v8" />
                              <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                            </svg>
                            Dar de baja
                          </button>
                        ) : (
                          <button className="icon-btn" type="button" disabled={accionEnCursoId === p.id} onClick={() => void reactivar(p)}>
                            <svg viewBox="0 0 24 24">
                              <path d="M12 2v8" />
                              <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                            </svg>
                            Reactivar
                          </button>
                        )}
                        <button className="icon-btn" type="button" onClick={() => abrirEdicion(p)}>
                          <svg viewBox="0 0 24 24">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                          Editar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
      <footer className="wf-footer">
        <span>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: "var(--ok)", marginRight: 4 }} />
          Activo — se ofrece como opción en Mobile
        </span>
        <span>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: "var(--text-faint)", marginRight: 4 }} />
          Dado de baja
        </span>
        <span>Cambiar de sitio no pierde los cambios ya guardados en otro.</span>
      </footer>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.editingId ? "Editar punto" : "Agregar punto"}
        footer={
          <>
            <button className="btn-ghost" type="button" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button className="btn-primary" type="button" disabled={guardando} onClick={() => void guardarDrawer()}>
              {guardando ? "Guardando…" : drawer?.editingId ? "Guardar cambios" : "Agregar punto"}
            </button>
          </>
        }
      >
        {drawer && (
          <>
            <div className="dfield">
              <label htmlFor="fNombre">Nombre</label>
              <input
                id="fNombre"
                type="text"
                value={drawer.nombre}
                placeholder="ej. Portón Norte"
                onChange={(e) => setDrawer({ ...drawer, nombre: e.target.value })}
              />
            </div>
            <div className="dfield">
              <label htmlFor="fDesc">Descripción / ubicación</label>
              <textarea
                id="fDesc"
                rows={3}
                value={drawer.descripcion}
                placeholder="ej. Acceso norte, junto a la garita de seguridad"
                onChange={(e) => setDrawer({ ...drawer, descripcion: e.target.value })}
              />
              <div className="hint">Ayuda a que la gente identifique el punto en el momento — no hace falta que sea una dirección formal.</div>
            </div>
            <div className="dfield">
              <label>Sitio</label>
              <input type="text" value={sitioNombre} disabled style={{ opacity: 0.6 }} />
              <div className="hint">Un punto de encuentro pertenece a un solo sitio — para agregarlo a otro, cambiá el sitio arriba primero.</div>
            </div>
          </>
        )}
      </Drawer>

      <Toast mensaje={mensaje} />
    </div>
  );
}
