// Ver Cowork "Accountability en Vivo". Reusa el <Topbar> compartido de
// la app; la franja de evento se agrega debajo (ver Accountability.css).
// Refresco por polling cada 10s mientras la pantalla está abierta — no
// Supabase Realtime, para no sumar una dependencia nueva en este primer
// corte (ver README, "Accountability en vivo").
//
// Deliberadamente NO construido acá (ver Cowork wireframe + ROADMAP.md):
// deshabilitar/rehabilitar un punto de encuentro con aviso a las
// personas (necesita diseño de backend propio — `puntos_encuentro.activo`
// ya existe pero es un flag permanente, no "deshabilitado para ESTE
// evento"), y "marcar visto"/llamar desde la ficha de una persona más
// allá de un link `tel:` simple (no hay ningún campo de "visto" en el
// esquema). Frontend Web nunca dispara ni cierra eventos — eso lo hace
// solo la consola física, ver Cowork "Panorama de Sitios".

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getEventoActivo, getContadores, getConfirmaciones, type EventoActivo, type ContadorPunto, type Totales, type ConfirmacionDetalle } from "../lib/accountability";
import { listarConsolas, type ConsolaEstado } from "../lib/consolas";
import { formatearReloj, tiempoRelativo } from "../lib/tiempoRelativo";
import { Topbar } from "../components/Topbar";
import { Drawer } from "../components/Drawer";
import "./Accountability.css";

const INTERVALO_REFRESCO_MS = 10_000;

type FiltroEstado = "todos" | "ok" | "ayuda" | "pendiente";

function estadoLabel(e: "ok" | "ayuda" | "pendiente"): string {
  return e === "ok" ? "OK" : e === "ayuda" ? "Pidió ayuda" : "Sin respuesta";
}

export function Accountability() {
  const { id: sitioId } = useParams<{ id: string }>();

  const [sitioNombre, setSitioNombre] = useState<string | null>(null);
  const [evento, setEvento] = useState<EventoActivo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contadores, setContadores] = useState<{ totales: Totales; porPunto: ContadorPunto[] } | null>(null);
  const [confirmaciones, setConfirmaciones] = useState<ConfirmacionDetalle[] | null>(null);
  const [consolas, setConsolas] = useState<ConsolaEstado[] | null>(null);
  const [ahora, setAhora] = useState(Date.now());

  const [filtroPunto, setFiltroPunto] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<ConfirmacionDetalle | null>(null);

  useEffect(() => {
    if (!sitioId) return;
    supabase
      .from("sitios")
      .select("nombre")
      .eq("id", sitioId)
      .maybeSingle()
      .then(({ data }) => setSitioNombre((data?.nombre as string) ?? null));
  }, [sitioId]);

  async function cargar(sid: string) {
    setError(null);
    try {
      const ev = await getEventoActivo(sid);
      setEvento(ev);
      if (ev) {
        const [c, conf, cons] = await Promise.all([getContadores(ev.id, sid), getConfirmaciones(ev.id), listarConsolas(sid)]);
        setContadores(c);
        setConfirmaciones(conf);
        setConsolas(cons);
      } else {
        setContadores(null);
        setConfirmaciones(null);
        setConsolas(await listarConsolas(sid));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el estado del sitio.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!sitioId) return;
    void cargar(sitioId);
    const intervalo = window.setInterval(() => void cargar(sitioId), INTERVALO_REFRESCO_MS);
    return () => window.clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioId]);

  useEffect(() => {
    if (!evento) return;
    const tick = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [evento?.id]);

  if (!sitioId) return null;

  const filtradas = (confirmaciones ?? []).filter((c) => {
    if (filtroPunto && c.puntoId !== filtroPunto) return false;
    if (filtroEstado !== "todos" && c.estado !== filtroEstado) return false;
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      if (!c.nombre.toLowerCase().includes(q) && !(c.legajo ?? "").toLowerCase().includes(q) && !c.dni.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="app">
      <Topbar titulo={sitioNombre ?? "Sitio"} />

      {evento && (
        <div className={`event-banner ${evento.modo}`}>
          <span className="event-pulse" />
          <span className="event-type">{evento.tipoNombre}</span>
          <div className="event-meta">
            <div className="l1">
              {evento.operadorNombre ? (
                <>
                  Disparado por <b>{evento.operadorNombre}</b>
                </>
              ) : (
                "Disparado"
              )}
              {evento.consolaNombre ? (
                <>
                  {" "}
                  · <b>{evento.consolaNombre}</b>
                </>
              ) : null}
            </div>
            <div className="l2">{evento.modo === "real" ? "Evento real" : "Simulacro"}</div>
          </div>
          <span className="mode-badge">{evento.modo === "real" ? "Real" : "Simulacro"}</span>
          <div className="event-clock">
            <div className="t num">{formatearReloj(evento.iniciadoAt, ahora)}</div>
            <div className="l">Tiempo transcurrido</div>
          </div>
        </div>
      )}

      <main>
        {error && <div className="empty">No se pudo cargar: {error}</div>}
        {!error && cargando && <div className="empty">Cargando…</div>}

        {!error && !cargando && !evento && (
          <div className="empty">No hay ningún evento en curso en este sitio en este momento.</div>
        )}

        {!error && !cargando && evento && contadores && (
          <>
            <div className="section-label">
              Accountability del evento en curso
              <span className="line" />
            </div>

            <section className="kpi-strip">
              <div className="kpi total">
                <div className="k-label">Notificados</div>
                <div className="k-value num">{contadores.totales.total}</div>
                <div className="k-sub">Personal alcanzado por push + SMS</div>
              </div>
              <div className="kpi ok">
                <div className="k-label">Confirmaron OK</div>
                <div className="k-value num">{contadores.totales.ok}</div>
                <div className="k-bar">
                  <i style={{ width: `${porcentaje(contadores.totales.ok, contadores.totales.total)}%` }} />
                </div>
              </div>
              <div className="kpi help">
                <div className="k-label">Pidieron ayuda</div>
                <div className="k-value num">{contadores.totales.ayuda}</div>
                <div className="k-bar">
                  <i style={{ width: `${porcentaje(contadores.totales.ayuda, contadores.totales.total)}%` }} />
                </div>
              </div>
              <div className="kpi pending">
                <div className="k-label">Sin respuesta</div>
                <div className="k-value num">{contadores.totales.pendiente}</div>
                <div className="k-bar">
                  <i style={{ width: `${porcentaje(contadores.totales.pendiente, contadores.totales.total)}%` }} />
                </div>
              </div>
            </section>

            <section className="split">
              <div className="muster-col">
                <div className="muster-col-head">
                  <span className="t">Puntos de encuentro</span>
                  <span className="hint">Clic en un punto para filtrar la tabla de al lado.</span>
                </div>
                <div className="muster-list">
                  {contadores.porPunto.map((p) => {
                    const total = p.ok + p.ayuda + p.pendiente || 1;
                    const estadoCls = p.ayuda > 0 ? "attention" : p.pendiente > 0 ? "progress" : "complete";
                    const estadoTxt = p.ayuda > 0 ? "Requiere atención" : p.pendiente > 0 ? "En curso" : "Completo";
                    return (
                      <div
                        key={p.puntoId ?? "sin-punto"}
                        className={filtroPunto === p.puntoId ? "muster-card selected" : "muster-card"}
                        role="button"
                        tabIndex={0}
                        onClick={() => setFiltroPunto(filtroPunto === p.puntoId ? null : p.puntoId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setFiltroPunto(filtroPunto === p.puntoId ? null : p.puntoId);
                          }
                        }}
                      >
                        <div className="m-top">
                          <div className="m-name">{p.puntoNombre}</div>
                          <div className="m-count num">
                            {p.ok + p.ayuda}/{p.ok + p.ayuda + p.pendiente}
                          </div>
                        </div>
                        <div className="m-bar">
                          <span className="seg-ok" style={{ width: `${(100 * p.ok) / total}%` }} />
                          <span className="seg-help" style={{ width: `${(100 * p.ayuda) / total}%` }} />
                          <span className="seg-pending" style={{ width: `${(100 * p.pendiente) / total}%` }} />
                        </div>
                        <span className={`m-status ${estadoCls}`}>{estadoTxt}</span>
                      </div>
                    );
                  })}
                  {filtroPunto && (
                    <button className="clear-filter" type="button" onClick={() => setFiltroPunto(null)}>
                      Quitar filtro de punto
                    </button>
                  )}
                </div>
              </div>

              <div className="table-panel">
                <div className="table-toolbar">
                  <div className="chip-group">
                    {(["todos", "ok", "ayuda", "pendiente"] as FiltroEstado[]).map((f) => (
                      <button key={f} type="button" className={filtroEstado === f ? "chip active" : "chip"} onClick={() => setFiltroEstado(f)}>
                        {f === "todos" ? "Todos" : f === "ok" ? "OK" : f === "ayuda" ? "Ayuda" : "Sin respuesta"}
                      </button>
                    ))}
                  </div>
                  <div className="search-wrap">
                    <svg viewBox="0 0 24 24">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4.3-4.3" />
                    </svg>
                    <input type="text" placeholder="Buscar nombre, DNI o legajo…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Personal</th>
                        <th>Tipo</th>
                        <th>Punto de encuentro</th>
                        <th>Estado</th>
                        <th>Confirmó</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtradas.length === 0 ? (
                        <tr className="empty-row">
                          <td colSpan={5}>No hay personal que coincida con este filtro.</td>
                        </tr>
                      ) : (
                        filtradas.map((c) => (
                          <tr key={c.id} className={c.estado === "ayuda" ? "row-help" : ""} onClick={() => setSeleccion(c)}>
                            <td>
                              <div className="p-name">{c.nombre}</div>
                              <div className="p-legajo num">{c.legajo ? `Legajo ${c.legajo}` : `DNI ${c.dni}`}</div>
                            </td>
                            <td>{c.tipo === "fijo" ? "Fijo" : "Eventual"}</td>
                            <td>{c.puntoNombre ?? "—"}</td>
                            <td>
                              <span className={`status-pill ${c.estado}`}>{estadoLabel(c.estado)}</span>
                            </td>
                            <td className="num">{c.confirmadoAt ? tiempoRelativo(c.confirmadoAt) : "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}

        <div className="section-label">
          Consolas del sitio
          <span className="line" />
        </div>
        {consolas === null ? (
          <div className="empty">Cargando…</div>
        ) : consolas.length === 0 ? (
          <div className="empty">Este sitio no tiene ninguna consola configurada todavía.</div>
        ) : (
          <section className="device-strip">
            {consolas.map((d) => (
              <div key={d.id} className={d.enLinea ? "device-card" : "device-card offline"}>
                <div className="d-top">
                  <span className="d-dot" />
                  <span className="d-name">{d.nombre}</span>
                  <span className="d-state">{d.enLinea ? "En línea" : "Sin conexión"}</span>
                </div>
                <div className="d-sub">
                  {d.enLinea ? "Último heartbeat " : "Sin conexión desde "}
                  {d.ultimoHeartbeat ? tiempoRelativo(d.ultimoHeartbeat) : "—"}
                </div>
              </div>
            ))}
          </section>
        )}
      </main>

      <Drawer
        open={seleccion !== null}
        onClose={() => setSeleccion(null)}
        title={seleccion?.nombre ?? ""}
        footer={
          seleccion?.telefono ? (
            <a className="btn-primary" style={{ justifyContent: "center", width: "100%" }} href={`tel:${seleccion.telefono}`}>
              Llamar a {seleccion.telefono}
            </a>
          ) : null
        }
      >
        {seleccion && (
          <>
            <div className="field">
              <div className="f-label">Estado</div>
              <div className="f-value">{estadoLabel(seleccion.estado)}</div>
            </div>
            <div className="field">
              <div className="f-label">Punto de encuentro</div>
              <div className="f-value">{seleccion.puntoNombre ?? "No eligió ninguno"}</div>
            </div>
            <div className="field">
              <div className="f-label">Tipo</div>
              <div className="f-value">
                {seleccion.tipo === "fijo" ? "Fijo" : "Eventual"} · DNI {seleccion.dni}
                {seleccion.legajo ? ` · Legajo ${seleccion.legajo}` : ""}
              </div>
            </div>
            <div className="field">
              <div className="f-label">Confirmó</div>
              <div className="f-value">{seleccion.confirmadoAt ? tiempoRelativo(seleccion.confirmadoAt) : "Todavía no"}</div>
            </div>
            {seleccion.notaAyuda && (
              <div className="field">
                <div className="f-label">Nota</div>
                <div className="note-box">{seleccion.notaAyuda}</div>
              </div>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}

function porcentaje(n: number, total: number): number {
  if (total <= 0) return 0;
  return (100 * n) / total;
}
