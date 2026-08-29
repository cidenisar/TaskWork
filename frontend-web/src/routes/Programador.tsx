// Ver Cowork "Programador de Simulacros". Alta/edición/cancelación de
// simulacros programados — Historial de cumplimiento (la mitad de
// lectura) ya está en /simulacros/historial, así que acá no se repite
// esa sección del wireframe (sería la misma agregación mostrada dos
// veces) — hay un link a esa pantalla en el pie en su lugar.
//
// A diferencia de Puntos de encuentro, programar/editar/cancelar pasan
// por backend-server (ver lib/programador.ts para el porqué). Listar
// sitios/tipos/próximos es lectura directa (org_isolation ya se lo
// permite a un admin).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listarSitiosVisibles, type SitioConEstado } from "../lib/sitios";
import {
  listarTiposEvento,
  listarProximos,
  programarSimulacro,
  editarSimulacro,
  cancelarSimulacro,
  formatearFechaHoraUTC,
  formatearRecurrencia,
  horaUTC,
  fechaUTC,
  DIAS_SEMANA,
  OCURRENCIAS,
  type TipoEventoOpcion,
  type SimulacroProximo,
  type Posicion,
} from "../lib/programador";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import "./Programador.css";

interface FormularioDrawer {
  editingId: string | null;
  tipoEventoId: string;
  puntual: boolean;
  fecha: string;
  hora: string;
  diaSemana: number;
  posicion: Posicion;
}

const COLOR_POR_TIPO: Record<string, { fill: string; text: string }> = {
  incendio: { fill: "#e11d2e", text: "#fff" },
  sismo: { fill: "#f5c518", text: "#3a2f05" },
  medico: { fill: "#22c55e", text: "#05230f" },
  toxico: { fill: "#2563eb", text: "#fff" },
  viento: { fill: "#f59e0b", text: "#3a2405" },
};
function colorDeTipo(nombre: string): { fill: string; text: string } {
  const clave = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return COLOR_POR_TIPO[clave] ?? { fill: "#3d4a56", text: "#fff" };
}

function estadoLabel(estado: SimulacroProximo["estado"]): string {
  return estado === "programado" ? "Programado" : "Pendiente de confirmación";
}

export function Programador() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [sitios, setSitios] = useState<SitioConEstado[] | null>(null);
  const [sitioId, setSitioId] = useState<string>("");
  const [tipos, setTipos] = useState<TipoEventoOpcion[]>([]);
  const [proximos, setProximos] = useState<SimulacroProximo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoCancelId, setConfirmandoCancelId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FormularioDrawer | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [accionEnCursoId, setAccionEnCursoId] = useState<string | null>(null);

  useEffect(() => {
    if (!operador) return;
    (async () => {
      try {
        const [listaSitios, listaTipos] = await Promise.all([listarSitiosVisibles(operador), listarTiposEvento(operador.organizacionId)]);
        setSitios(listaSitios);
        setTipos(listaTipos);
        if (listaSitios.length > 0) setSitioId((actual) => actual || listaSitios[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la lista de sitios.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  async function cargarProximos(id: string) {
    setError(null);
    setConfirmandoCancelId(null);
    try {
      setProximos(await listarProximos(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los simulacros programados.");
    }
  }

  useEffect(() => {
    if (!sitioId) return;
    setProximos(null);
    void cargarProximos(sitioId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitioId]);

  const sitioNombre = useMemo(() => sitios?.find((s) => s.id === sitioId)?.nombre ?? "", [sitios, sitioId]);

  if (!operador) return null;

  function abrirAlta() {
    setDrawer({ editingId: null, tipoEventoId: tipos[0]?.id ?? "", puntual: true, fecha: "", hora: "10:00", diaSemana: 1, posicion: 1 });
  }
  function abrirEdicion(s: SimulacroProximo) {
    setDrawer({
      editingId: s.id,
      tipoEventoId: s.tipoEventoId,
      puntual: s.puntual,
      fecha: s.puntual ? fechaUTC(s.fechaHora) : "",
      hora: horaUTC(s.fechaHora),
      diaSemana: s.recurrencia?.diaSemana ?? 1,
      posicion: s.recurrencia?.posicion ?? 1,
    });
  }

  async function guardarDrawer() {
    if (!drawer) return;
    if (!drawer.tipoEventoId) {
      mostrar("Elegí un tipo de evento.");
      return;
    }
    if (drawer.puntual && !drawer.fecha) {
      mostrar("Falta la fecha del simulacro.");
      return;
    }
    if (!drawer.hora) {
      mostrar("Falta la hora del simulacro.");
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        sitioId,
        tipoEventoId: drawer.tipoEventoId,
        puntual: drawer.puntual,
        fecha: drawer.puntual ? drawer.fecha : null,
        hora: drawer.hora,
        diaSemana: drawer.puntual ? null : drawer.diaSemana,
        posicion: drawer.puntual ? null : drawer.posicion,
      };
      const resultado = drawer.editingId ? await editarSimulacro(drawer.editingId, payload) : await programarSimulacro(payload);
      if (!resultado.ok) {
        mostrar(resultado.error);
        return;
      }
      const editando = drawer.editingId !== null;
      setDrawer(null);
      await cargarProximos(sitioId);
      mostrar(editando ? "Cambios guardados." : "Simulacro programado.");
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando el simulacro.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarCancelar(s: SimulacroProximo) {
    setAccionEnCursoId(s.id);
    try {
      const resultado = await cancelarSimulacro(s.id);
      if (!resultado.ok) {
        mostrar(resultado.error);
        return;
      }
      setConfirmandoCancelId(null);
      mostrar(`Simulacro de ${s.tipoEventoNombre} cancelado.`);
      await cargarProximos(sitioId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado cancelando el simulacro.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  return (
    <div className="app">
      <Topbar
        titulo="Simulacros"
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
            Calendario de simulacros programados para <b>{sitioNombre || "…"}</b>, puntuales o recurrentes. Ver{" "}
            <Link to="/simulacros/historial">Historial de cumplimiento</Link> para lo efectivamente disparado.
          </p>
        </div>

        <div className="info-box">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <div>
            <b>Programar un simulacro es solo un recordatorio — nunca dispara nada por sí solo.</b> Cuando llega la hora, el sistema lo
            muestra como recordatorio de solo lectura en la consola física de este sitio y lo marca "Pendiente de confirmación" acá. El
            disparo real sigue siendo manual — un operador aprieta el botón correspondiente en la consola. Si nadie lo dispara en un tiempo
            prudencial, queda "No realizado" en el historial.
          </div>
        </div>

        {error && <div className="empty">No se pudo cargar: {error}</div>}
        {!error && sitios !== null && sitios.length === 0 && <div className="empty">No tenés ningún sitio asignado.</div>}
        {!error && sitios !== null && sitios.length > 0 && proximos === null && <div className="empty">Cargando simulacros programados…</div>}

        {!error && sitios !== null && sitios.length > 0 && proximos !== null && (
          <>
            <div className="toolbar">
              <div className="section-head" style={{ flex: 1 }}>
                <h2>Próximos</h2>
                <div className="sh-count">
                  <b>{proximos.length}</b> programados
                </div>
              </div>
              <button className="btn-primary" type="button" disabled={tipos.length === 0} onClick={abrirAlta}>
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Programar simulacro
              </button>
            </div>

            {proximos.length === 0 ? (
              <div className="empty">No hay simulacros programados para este sitio.</div>
            ) : (
              <div className="list">
                {proximos.map((s) => {
                  const color = colorDeTipo(s.tipoEventoNombre);
                  if (confirmandoCancelId === s.id) {
                    return (
                      <div className="drill-row" key={s.id}>
                        <div className="dr-type" style={{ background: color.fill, color: color.text }}>
                          {s.tipoEventoNombre.toUpperCase()}
                        </div>
                        <div className="confirm-row">
                          <div className="cr-text">
                            ¿Cancelar el simulacro de <b>{s.tipoEventoNombre}</b> programado para {formatearFechaHoraUTC(s.fechaHora)}?
                          </div>
                          <div className="cr-actions">
                            <button className="btn-ghost" type="button" onClick={() => setConfirmandoCancelId(null)}>
                              Volver
                            </button>
                            <button className="btn-danger" type="button" disabled={accionEnCursoId === s.id} onClick={() => void confirmarCancelar(s)}>
                              Cancelar simulacro
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className={s.estado === "pendiente_confirmacion" ? "drill-row pending" : "drill-row"} key={s.id}>
                      <div className="dr-type" style={{ background: color.fill, color: color.text }}>
                        {s.tipoEventoNombre.toUpperCase()}
                      </div>
                      <div className="dr-main">
                        <div className="dr-title">
                          Simulacro {s.tipoEventoNombre}
                          <span className="rec-pill">{s.recurrencia ? formatearRecurrencia(s.recurrencia) : "Puntual"}</span>
                        </div>
                        <div className="dr-sub">{formatearFechaHoraUTC(s.fechaHora)}</div>
                      </div>
                      <span className={`status-pill ${s.estado === "pendiente_confirmacion" ? "pendiente" : "programado"}`}>{estadoLabel(s.estado)}</span>
                      <div className="dr-actions">
                        <button className="icon-btn" type="button" onClick={() => abrirEdicion(s)}>
                          <svg viewBox="0 0 24 24">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                          Editar
                        </button>
                        <button className="icon-btn" type="button" onClick={() => setConfirmandoCancelId(s.id)}>
                          <svg viewBox="0 0 24 24">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                          Cancelar
                        </button>
                      </div>
                      {s.estado === "pendiente_confirmacion" && (
                        <div className="pending-note">
                          <svg viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                          Ya se avisó como recordatorio de solo lectura en la consola física — si nadie lo dispara en un tiempo prudencial, va
                          a quedar registrado como "no realizado".
                        </div>
                      )}
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
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: "var(--info)", marginRight: 4 }} />
          Programado
        </span>
        <span>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: "var(--pending)", marginRight: 4 }} />
          Pendiente de confirmación
        </span>
        <span>Ver también: Historial de cumplimiento.</span>
      </footer>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.editingId ? "Editar simulacro" : "Programar simulacro"}
        footer={
          <>
            <button className="btn-ghost" type="button" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button className="btn-primary" type="button" disabled={guardando} onClick={() => void guardarDrawer()}>
              {guardando ? "Guardando…" : drawer?.editingId ? "Guardar cambios" : "Programar"}
            </button>
          </>
        }
      >
        {drawer && (
          <>
            <div className="dfield">
              <label htmlFor="fTipo">Tipo de evento</label>
              <select id="fTipo" value={drawer.tipoEventoId} onChange={(e) => setDrawer({ ...drawer, tipoEventoId: e.target.value })}>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
              <div className="hint">Mismos tipos que los botones físicos de la consola.</div>
            </div>
            <div className="dfield">
              <label>Repetición</label>
              <div className="seg-toggle">
                <button type="button" className={drawer.puntual ? "on" : ""} onClick={() => setDrawer({ ...drawer, puntual: true })}>
                  Puntual
                </button>
                <button type="button" className={!drawer.puntual ? "on" : ""} onClick={() => setDrawer({ ...drawer, puntual: false })}>
                  Recurrente
                </button>
              </div>
            </div>
            {drawer.puntual ? (
              <div className="dfield">
                <label htmlFor="fFecha">Fecha</label>
                <input id="fFecha" type="date" value={drawer.fecha} onChange={(e) => setDrawer({ ...drawer, fecha: e.target.value })} />
              </div>
            ) : (
              <div className="dfield">
                <div className="row2">
                  <div className="dfield">
                    <label htmlFor="fOcurrencia">Ocurrencia</label>
                    <select id="fOcurrencia" value={drawer.posicion} onChange={(e) => setDrawer({ ...drawer, posicion: Number(e.target.value) as Posicion })}>
                      {OCURRENCIAS.map((o) => (
                        <option key={o.valor} value={o.valor}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="dfield">
                    <label htmlFor="fDia">Día</label>
                    <select id="fDia" value={drawer.diaSemana} onChange={(e) => setDrawer({ ...drawer, diaSemana: Number(e.target.value) })}>
                      {DIAS_SEMANA.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="hint">Ej. "Primer Lunes" = primer lunes de cada mes.</div>
              </div>
            )}
            <div className="dfield">
              <label htmlFor="fHora">Hora</label>
              <input id="fHora" type="time" value={drawer.hora} onChange={(e) => setDrawer({ ...drawer, hora: e.target.value })} />
              <div className="hint">Hora UTC — este sistema no ajusta por huso horario del sitio.</div>
            </div>
            <div className="dfield">
              <label>Sitio</label>
              <input type="text" value={sitioNombre} disabled style={{ opacity: 0.6 }} />
              <div className="hint">Un simulacro pertenece a un solo sitio — para programarlo en otro, cambiá el sitio arriba primero.</div>
            </div>
          </>
        )}
      </Drawer>

      <Toast mensaje={mensaje} />
    </div>
  );
}
