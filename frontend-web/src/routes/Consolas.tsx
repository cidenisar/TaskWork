// Administración de Consolas — alta/edición/baja-reactivación + la
// asignación PROG1-4 (ver backend-server/README.md, "Sincronización de
// PROG1-4", y consola-pi/README.md — la pantalla que faltaba ahí).
//
// Mismo criterio que Puntos de Encuentro: selector de sitio con
// `listarSitiosVisibles` (ya filtrado por el alcance del admin), alta/
// edición/baja son escritura directa contra Supabase (org_isolation).
//
// `en_linea`/`ultimo_heartbeat` son de solo lectura (los escribe
// backend-server desde el heartbeat MQTT real) — esta pantalla nunca
// los toca, solo los muestra.
//
// PROG1-4 escrito acá NO llega a la consola física al toque: lo levanta
// el barrido periódico de backend-server (cada 5 min / al reiniciar),
// igual que el padrón — no hay push puntual todavía (ver lib/consolas.ts).

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { listarSitiosVisibles, type SitioConEstado } from "../lib/sitios";
import { listarTiposEvento, type TipoEventoOpcion } from "../lib/programador";
import {
  listarConsolasAdmin,
  crearConsola,
  actualizarConsola,
  cambiarEstadoConsola,
  type ConsolaAdmin,
  type ProgConfig,
} from "../lib/consolas";
import { tiempoRelativo } from "../lib/tiempoRelativo";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import "./Puntos.css";
import "./Consolas.css";

const PROG_VACIO: ProgConfig = { prog1: null, prog2: null, prog3: null, prog4: null };

interface FormularioDrawer {
  editingId: string | null;
  nombre: string;
  nota: string;
  prog: ProgConfig;
}

export function Consolas() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [sitios, setSitios] = useState<SitioConEstado[] | null>(null);
  const [sitioId, setSitioId] = useState<string>("");
  const [tiposEvento, setTiposEvento] = useState<TipoEventoOpcion[]>([]);
  const [consolas, setConsolas] = useState<ConsolaAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBajaId, setConfirmandoBajaId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FormularioDrawer | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [accionEnCursoId, setAccionEnCursoId] = useState<string | null>(null);

  useEffect(() => {
    if (!operador) return;
    (async () => {
      try {
        const [lista, tipos] = await Promise.all([listarSitiosVisibles(operador), listarTiposEvento(operador.organizacionId)]);
        setSitios(lista);
        setTiposEvento(tipos);
        if (lista.length > 0) setSitioId((actual) => actual || lista[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la lista de sitios.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  async function cargarConsolas(id: string) {
    setError(null);
    setConfirmandoBajaId(null);
    try {
      setConsolas(await listarConsolasAdmin(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las consolas.");
    }
  }

  useEffect(() => {
    if (!sitioId) return;
    setConsolas(null);
    void cargarConsolas(sitioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioId]);

  const sitioNombre = useMemo(() => sitios?.find((s) => s.id === sitioId)?.nombre ?? "", [sitios, sitioId]);
  const activas = consolas ? consolas.filter((c) => c.estadoConfig === "activa").length : 0;

  function nombreTipo(id: string | null): string {
    if (!id) return "Sin asignar";
    return tiposEvento.find((t) => t.id === id)?.nombre ?? "Tipo eliminado";
  }

  if (!operador) return null;

  function abrirAlta() {
    setDrawer({ editingId: null, nombre: "", nota: "", prog: PROG_VACIO });
  }
  function abrirEdicion(c: ConsolaAdmin) {
    setDrawer({ editingId: c.id, nombre: c.nombre, nota: c.nota ?? "", prog: c.progConfig });
  }

  async function guardarDrawer() {
    if (!drawer) return;
    const nombre = drawer.nombre.trim();
    if (!nombre) {
      mostrar("Falta el nombre de la consola.");
      return;
    }
    setGuardando(true);
    try {
      if (drawer.editingId) {
        await actualizarConsola(drawer.editingId, nombre, drawer.nota.trim(), drawer.prog);
        mostrar("Cambios guardados.");
      } else {
        await crearConsola(sitioId, nombre, drawer.nota.trim(), drawer.prog);
        mostrar(`"${nombre}" agregada.`);
      }
      setDrawer(null);
      await cargarConsolas(sitioId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando los cambios.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBaja(c: ConsolaAdmin) {
    setAccionEnCursoId(c.id);
    try {
      await cambiarEstadoConsola(c.id, "de_baja");
      setConfirmandoBajaId(null);
      mostrar(`"${c.nombre}" dada de baja.`);
      await cargarConsolas(sitioId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado dando de baja a la consola.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  async function reactivar(c: ConsolaAdmin) {
    setAccionEnCursoId(c.id);
    try {
      await cambiarEstadoConsola(c.id, "activa");
      mostrar(`"${c.nombre}" reactivada.`);
      await cargarConsolas(sitioId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado reactivando la consola.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  return (
    <div className="app">
      <Topbar
        titulo="Consolas"
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
            Las consolas físicas de <b>{sitioNombre || "…"}</b> y qué tipo de evento dispara cada botón PROG1-4 (los botones fijos —
            INCENDIO, SISMO, MÉDICO, TÓXICO, OK — no se configuran acá, son siempre los mismos). Un cambio de PROG1-4 tarda hasta 5 minutos
            en llegar a la consola física (mismo barrido periódico que sincroniza el padrón).
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar: {error}</div>}

        {!error && sitios !== null && sitios.length === 0 && <div className="empty">No tenés ningún sitio asignado.</div>}

        {!error && sitios !== null && sitios.length > 0 && consolas === null && <div className="empty">Cargando consolas…</div>}

        {!error && sitios !== null && sitios.length > 0 && consolas !== null && (
          <>
            <div className="toolbar">
              <div className="tb-count">
                <b>{activas}</b> de {consolas.length} consolas activas en este sitio
              </div>
              <button className="btn-primary" type="button" onClick={abrirAlta}>
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Agregar consola
              </button>
            </div>

            {consolas.length === 0 ? (
              <div className="empty">Este sitio todavía no tiene consolas cargadas.</div>
            ) : (
              <div className="list">
                {consolas.map((c) => {
                  if (confirmandoBajaId === c.id) {
                    return (
                      <div className="point-row" key={c.id}>
                        <div className="confirm-row">
                          <div className="cr-text">
                            ¿Dar de baja <b>{c.nombre}</b>? Deja de considerarse una consola activa del sitio — no borra su historial ni
                            desconecta el hardware físico, si sigue enchufado va a seguir mandando heartbeat.
                          </div>
                          <div className="cr-actions">
                            <button className="btn-ghost" type="button" onClick={() => setConfirmandoBajaId(null)}>
                              Cancelar
                            </button>
                            <button className="btn-danger" type="button" disabled={accionEnCursoId === c.id} onClick={() => void confirmarBaja(c)}>
                              Dar de baja
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className={c.estadoConfig === "activa" ? "point-row" : "point-row inactive"} key={c.id}>
                      <div className="pr-main">
                        <div className="pr-name">
                          {c.nombre}
                          <span className={c.estadoConfig === "activa" ? "status-pill active" : "status-pill inactive"}>
                            {c.estadoConfig === "activa" ? "Activa" : "Dada de baja"}
                          </span>
                          <span className={c.enLinea ? "conn-dot online" : "conn-dot offline"}>
                            {c.enLinea ? "En línea" : c.ultimoHeartbeat ? `Sin conexión, ${tiempoRelativo(c.ultimoHeartbeat)}` : "Sin conexión"}
                          </span>
                        </div>
                        {c.nota && <div className="pr-desc">{c.nota}</div>}
                        <div className="prog-summary">
                          PROG1 {nombreTipo(c.progConfig.prog1)} · PROG2 {nombreTipo(c.progConfig.prog2)} · PROG3 {nombreTipo(c.progConfig.prog3)} · PROG4{" "}
                          {nombreTipo(c.progConfig.prog4)}
                        </div>
                      </div>
                      <div className="row-actions">
                        {c.estadoConfig === "activa" ? (
                          <button className="icon-btn" type="button" onClick={() => setConfirmandoBajaId(c.id)}>
                            <svg viewBox="0 0 24 24">
                              <path d="M12 2v8" />
                              <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                            </svg>
                            Dar de baja
                          </button>
                        ) : (
                          <button className="icon-btn" type="button" disabled={accionEnCursoId === c.id} onClick={() => void reactivar(c)}>
                            <svg viewBox="0 0 24 24">
                              <path d="M12 2v8" />
                              <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                            </svg>
                            Reactivar
                          </button>
                        )}
                        <button className="icon-btn" type="button" onClick={() => abrirEdicion(c)}>
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
          Activa — cuenta para el sitio
        </span>
        <span>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: "var(--text-faint)", marginRight: 4 }} />
          Dada de baja
        </span>
        <span>"En línea"/"Sin conexión" viene del heartbeat real del hardware — no se edita acá.</span>
      </footer>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.editingId ? "Editar consola" : "Agregar consola"}
        footer={
          <>
            <button className="btn-ghost" type="button" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button className="btn-primary" type="button" disabled={guardando} onClick={() => void guardarDrawer()}>
              {guardando ? "Guardando…" : drawer?.editingId ? "Guardar cambios" : "Agregar consola"}
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
                placeholder="ej. Bomberos"
                onChange={(e) => setDrawer({ ...drawer, nombre: e.target.value })}
              />
            </div>
            <div className="dfield">
              <label htmlFor="fNota">Nota (opcional)</label>
              <textarea
                id="fNota"
                rows={2}
                value={drawer.nota}
                placeholder="ej. Panel de la garita de entrada"
                onChange={(e) => setDrawer({ ...drawer, nota: e.target.value })}
              />
            </div>
            <div className="dfield">
              <label>Sitio</label>
              <input type="text" value={sitioNombre} disabled style={{ opacity: 0.6 }} />
            </div>
            <div className="dfield">
              <label>Botones PROG1-4</label>
              <div className="hint">Qué tipo de evento dispara cada botón programable. "Sin asignar" manda el nombre literal del botón (ej. "PROG1").</div>
              {(["prog1", "prog2", "prog3", "prog4"] as const).map((slot, i) => (
                <div className="prog-row" key={slot}>
                  <span className="prog-label">PROG{i + 1}</span>
                  <select
                    value={drawer.prog[slot] ?? ""}
                    onChange={(e) => setDrawer({ ...drawer, prog: { ...drawer.prog, [slot]: e.target.value || null } })}
                  >
                    <option value="">Sin asignar</option>
                    {tiposEvento.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}
      </Drawer>

      <Toast mensaje={mensaje} />
    </div>
  );
}
