// Historial de cumplimiento de simulacros — ver
// backend-server/README.md ("Vista de cumplimiento") y Cowork
// "Programador de Simulacros". Pasa por backend-server
// (GET /simulacros/cumplimiento, admin-only) en vez de leer directo
// contra Supabase: la granularidad real (por (sitio, tipo de evento),
// no un log de cada ocurrencia pasada) ya la calcula
// logic/cumplimiento.ts del backend — replicarla acá sería duplicarla.
//
// Distinto del wireframe a propósito: "Programador de Simulacros"
// muestra un log fila-por-fila de cada ocurrencia pasada de un sitio a
// la vez (con selector de sitio); el endpoint real da un resumen por
// (sitio, tipo) — el último resuelto, el próximo programado, y si está
// al día — no un historial completo. Acá se arma como una matriz de
// cumplimiento en vez de un log, que es lo que el dato real permite
// mostrar bien. El programador de simulacros en sí (alta/edición/
// cancelación) no está en esta pantalla, ver ROADMAP.md.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { obtenerCumplimiento, type EstadoCumplimiento } from "../lib/simulacros";
import { formatearFecha } from "../lib/tiempoRelativo";
import { Topbar } from "../components/Topbar";
import "./Historial.css";

type FiltroEstado = "todos" | "aldia" | "vencido";

export function Historial() {
  const { operador } = useAuth();
  const [filas, setFilas] = useState<EstadoCumplimiento[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtroSitio, setFiltroSitio] = useState<string>("todos");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");

  useEffect(() => {
    if (!operador) return;
    let cancelado = false;
    obtenerCumplimiento()
      .then((f) => {
        if (!cancelado) setFilas(f);
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : "No se pudo cargar el cumplimiento.");
      });
    return () => {
      cancelado = true;
    };
  }, [operador]);

  const sitios = useMemo(() => {
    if (!filas) return [];
    const nombres = new Map<string, string>();
    for (const f of filas) nombres.set(f.sitioId, f.sitioNombre);
    return [...nombres.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [filas]);

  const filtradas = useMemo(() => {
    if (!filas) return [];
    return filas
      .filter((f) => filtroSitio === "todos" || f.sitioId === filtroSitio)
      .filter((f) => filtroEstado === "todos" || (filtroEstado === "aldia" ? f.alDia : !f.alDia))
      .sort((a, b) => a.sitioNombre.localeCompare(b.sitioNombre) || a.tipoEventoNombre.localeCompare(b.tipoEventoNombre));
  }, [filas, filtroSitio, filtroEstado]);

  if (!operador) return null;

  const alDiaCount = filas ? filas.filter((f) => f.alDia).length : 0;

  return (
    <div className="app">
      <Topbar titulo="Historial de simulacros" />
      <main>
        <div className="intro">
          <div className="eyebrow">Administración · cumplimiento del programa de simulacros</div>
          <p>
            Estado de cumplimiento por sitio y tipo de evento: cuándo fue el último simulacro efectivamente disparado, si sigue habiendo
            uno programado, y si está al día. Programar un simulacro nuevo todavía no tiene pantalla propia, ver ROADMAP.md.
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar: {error}</div>}
        {!error && filas === null && <div className="empty">Cargando…</div>}

        {!error && filas !== null && (
          <>
            <div className="toolbar">
              <div className="tb-count">
                <b>{alDiaCount}</b> de {filas.length} al día
              </div>
              <select className="fselect" value={filtroSitio} onChange={(e) => setFiltroSitio(e.target.value)}>
                <option value="todos">Todos los sitios</option>
                {sitios.map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
              <div className="chip-group">
                <button type="button" className={filtroEstado === "todos" ? "chip active" : "chip"} onClick={() => setFiltroEstado("todos")}>
                  Todos
                </button>
                <button type="button" className={filtroEstado === "aldia" ? "chip active" : "chip"} onClick={() => setFiltroEstado("aldia")}>
                  Al día
                </button>
                <button type="button" className={filtroEstado === "vencido" ? "chip active" : "chip"} onClick={() => setFiltroEstado("vencido")}>
                  Vencidos
                </button>
              </div>
            </div>

            {filas.length === 0 ? (
              <div className="empty">Todavía no hay ningún simulacro registrado en ningún sitio.</div>
            ) : filtradas.length === 0 ? (
              <div className="empty">Sin resultados para ese filtro.</div>
            ) : (
              <div className="table-panel">
                <table>
                  <thead>
                    <tr>
                      <th>Sitio</th>
                      <th>Tipo de evento</th>
                      <th>Estado</th>
                      <th>Último resuelto</th>
                      <th>Próximo programado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((f) => (
                      <tr key={`${f.sitioId}:${f.tipoEventoId}`}>
                        <td>{f.sitioNombre}</td>
                        <td>{f.tipoEventoNombre}</td>
                        <td>
                          <span className={f.alDia ? "status-pill aldia" : "status-pill vencido"}>{f.alDia ? "Al día" : "Vencido"}</span>
                        </td>
                        <td>
                          {f.ultimoResuelto ? (
                            <>
                              <div className="t-nombre">{f.ultimoResuelto.estado === "realizado" ? "Realizado" : "No realizado"}</div>
                              <div className="t-sub">{formatearFecha(f.ultimoResuelto.fechaHora)}</div>
                            </>
                          ) : (
                            <span className="t-sub">Nunca se realizó</span>
                          )}
                        </td>
                        <td>{f.proximoProgramado ? formatearFecha(f.proximoProgramado) : <span className="t-sub">Sin nada programado</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
