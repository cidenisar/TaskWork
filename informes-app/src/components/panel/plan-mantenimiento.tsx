"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import type { PanelMantenimientoItem, MantenimientoRealizado, KpisMantenimiento } from "@/lib/panel/mantenimientos";
import type { DotacionEstimada } from "@/lib/panel/mantenimiento-dotacion";
import {
  MantenimientoConfigTab,
  type IntervaloConfigurado,
  type SupuestosDotacion,
  type ChecklistItemCatalogo,
} from "@/components/panel/mantenimiento-config-tab";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

const BADGE_CLASE: Record<string, string> = { vencido: "danger", proximo: "warn", nunca: "warn", ok: "ok" };

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

/** Peor urgencia entre los ítems de un día — define el color del punto en la grilla. */
function peorUrgencia(items: PanelMantenimientoItem[]): string {
  if (items.some((i) => i.urgencia === "vencido")) return "vencido";
  if (items.some((i) => i.urgencia === "proximo" || i.urgencia === "nunca")) return "proximo";
  return "ok";
}

type Tab = "pendientes" | "calendario" | "realizados" | "dotacion" | "configuracion";

export function PlanMantenimiento({
  items,
  kpis,
  realizados,
  dotacion,
  esAdmin,
  intervalos,
  supuestosDotacion,
  checklistItems,
}: {
  items: PanelMantenimientoItem[];
  kpis: KpisMantenimiento;
  realizados: MantenimientoRealizado[];
  dotacion: DotacionEstimada;
  esAdmin: boolean;
  intervalos: IntervaloConfigurado[];
  supuestosDotacion: SupuestosDotacion;
  checklistItems: ChecklistItemCatalogo[];
}) {
  const [tab, setTab] = useState<Tab>("pendientes");
  const pendientes = useMemo(() => items.filter((i) => i.urgencia !== "ok"), [items]);

  const anioActual = new Date().getFullYear();
  const porMes = useMemo(() => {
    const buckets: PanelMantenimientoItem[][] = Array.from({ length: 12 }, () => []);
    const fueraDeAnio: PanelMantenimientoItem[] = [];
    for (const item of items) {
      if (!item.fechaObjetivo) {
        fueraDeAnio.push(item);
        continue;
      }
      const fecha = new Date(`${item.fechaObjetivo}T00:00:00`);
      if (fecha.getFullYear() === anioActual) buckets[fecha.getMonth()].push(item);
      else fueraDeAnio.push(item);
    }
    for (const b of buckets) b.sort((a, bItem) => (a.fechaObjetivo! < bItem.fechaObjetivo! ? -1 : 1));
    return { buckets, fueraDeAnio };
  }, [items, anioActual]);

  const [mesAbierto, setMesAbierto] = useState<number | null>(null);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const porDiaDelMesAbierto = useMemo(() => {
    const mapa = new Map<string, PanelMantenimientoItem[]>();
    if (mesAbierto == null) return mapa;
    for (const item of porMes.buckets[mesAbierto]) {
      mapa.set(item.fechaObjetivo!, [...(mapa.get(item.fechaObjetivo!) ?? []), item]);
    }
    return mapa;
  }, [porMes, mesAbierto]);

  function cerrarCalendarioMes() {
    setMesAbierto(null);
    setDiaAbierto(null);
  }

  const [filtroTexto, setFiltroTexto] = useState("");
  const realizadosFiltrados = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    if (!q) return realizados;
    return realizados.filter(
      (r) => r.texto.toLowerCase().includes(q) || r.ubicacionLabel.toLowerCase().includes(q) || r.categoriaLabel.toLowerCase().includes(q),
    );
  }, [realizados, filtroTexto]);

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-label">Equipos con intervalo configurado</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "var(--ok)" }}>
            {kpis.porcentajeAlDia}%
          </div>
          <div className="kpi-label">Al día</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: kpis.vencidos > 0 ? "var(--accent-2)" : undefined }}>
            {kpis.vencidos}
          </div>
          <div className="kpi-label">Vencidos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: kpis.proximos30Dias > 0 ? "var(--warn)" : undefined }}>
            {kpis.proximos30Dias}
          </div>
          <div className="kpi-label">Vencen en 30 días</div>
        </div>
      </div>

      <div className="subnav" style={{ margin: "0 0 14px" }}>
        <button type="button" className={tab === "pendientes" ? "active" : ""} onClick={() => setTab("pendientes")}>
          Pendientes
        </button>
        <button type="button" className={tab === "calendario" ? "active" : ""} onClick={() => setTab("calendario")}>
          Calendario {anioActual}
        </button>
        <button type="button" className={tab === "realizados" ? "active" : ""} onClick={() => setTab("realizados")}>
          Realizados
        </button>
        <button type="button" className={tab === "dotacion" ? "active" : ""} onClick={() => setTab("dotacion")}>
          Dotación
        </button>
        {esAdmin && (
          <button type="button" className={tab === "configuracion" ? "active" : ""} onClick={() => setTab("configuracion")}>
            <Icon name="wrench" size={13} /> Configuración
          </button>
        )}
      </div>

      {tab === "pendientes" && (
        <div className="card">
          <div className="panel-card-title">
            <h2>Plan de mantenimiento</h2>
            <span className="panel-card-count">
              {items.length} equipo{items.length === 1 ? "" : "s"} con intervalo configurado
            </span>
          </div>
          {items.length === 0 ? (
            <div className="empty-note">
              Todavía no hay intervalos de mantenimiento configurados —{" "}
              {esAdmin ? (
                <button type="button" className="link-btn" onClick={() => setTab("configuracion")}>
                  definilos en Configuración
                </button>
              ) : (
                "pedile a un Administrador que los defina en Configuración"
              )}{" "}
              para que esta pantalla empiece a avisar.
            </div>
          ) : pendientes.length === 0 ? (
            <div className="empty-note">Todo al día — ningún equipo con intervalo configurado está vencido ni próximo a vencer.</div>
          ) : (
            <div className="item-list">
              {pendientes.map((item) => (
                <div
                  className="list-item"
                  key={`${item.tipoEquipo}-${item.equipoId}`}
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}
                >
                  <div className="info">
                    <div className="avatar">
                      <Icon name="wrench" size={16} />
                    </div>
                    <div>
                      <div className="item-name">{item.texto}</div>
                      <div className="item-sub">
                        {item.tipoEquipoLabel} · {item.categoriaLabel} · {item.ubicacionLabel}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <span className={`venc-badge ${BADGE_CLASE[item.urgencia]}`}>{item.mensaje}</span>
                    <span className="item-sub">
                      Cada {item.frecuenciaDias} días{item.ultimaFecha ? ` · Último: ${fmtFecha(item.ultimaFecha)}` : ""}
                    </span>
                    {item.esProgramada && item.fechaObjetivo && (
                      <span className="chip">
                        <Icon name="calendar" size={11} /> {item.programacionEsManual ? "Programado (excepción)" : "Programado (auto)"}:{" "}
                        {fmtFecha(item.fechaObjetivo)}
                        {item.asignadoNombre ? ` · ${item.asignadoNombre}` : ""}
                      </span>
                    )}
                    {item.motivoLabel && (
                      <span className="venc-badge warn">
                        <Icon name="warning" size={11} /> Reprogramado: {item.motivoLabel}
                      </span>
                    )}
                    {item.clima?.lluviaProxima && (
                      <span className="venc-badge warn">
                        <Icon name="warning" size={11} /> Lluvia prevista en los próximos días ({Math.round(item.clima.probabilidadMaxima)}%)
                        — evaluá reprogramar
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "calendario" && (
        <div className="card">
          <div className="panel-card-title">
            <h2>Calendario {anioActual}</h2>
            <span className="panel-card-count">Acomodá las visitas a lo largo del año para cumplir el plan</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
            {MESES.map((nombreMes, i) => {
              const itemsDelMes = porMes.buckets[i];
              return (
                <button
                  type="button"
                  key={nombreMes}
                  className="card"
                  style={{ margin: 0, padding: 12, textAlign: "left", cursor: "pointer" }}
                  onClick={() => setMesAbierto(i)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>{nombreMes}</strong>
                    <span className="chip">{itemsDelMes.length}</span>
                  </div>
                  {itemsDelMes.length === 0 ? (
                    <div className="item-sub">Sin visitas planeadas</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {itemsDelMes.slice(0, 5).map((item) => (
                        <div key={`${item.tipoEquipo}-${item.equipoId}`} style={{ fontSize: 12 }}>
                          <span className={`venc-badge ${BADGE_CLASE[item.urgencia]}`} style={{ padding: "1px 6px", fontSize: 11 }}>
                            {fmtFecha(item.fechaObjetivo!).slice(0, 5)}
                          </span>{" "}
                          {item.texto} <span className="item-sub">({item.ubicacionLabel})</span>
                        </div>
                      ))}
                      {itemsDelMes.length > 5 && <div className="item-sub">+{itemsDelMes.length - 5} más</div>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {porMes.fueraDeAnio.length > 0 && (
            <div className="hint" style={{ marginTop: 14 }}>
              <Icon name="warning" size={12} /> {porMes.fueraDeAnio.length} equipo{porMes.fueraDeAnio.length === 1 ? "" : "s"} con fecha
              fuera de {anioActual} (muy vencido de años anteriores) o sin fecha calculable (nunca tuvo un mantenimiento) — ver en la
              pestaña &ldquo;Pendientes&rdquo;.
            </div>
          )}
        </div>
      )}

      {mesAbierto != null && (
        <div className="modal-overlay" onClick={cerrarCalendarioMes}>
          <div className="modal-card" style={{ maxWidth: diaAbierto ? 420 : 540 }} onClick={(e) => e.stopPropagation()}>
            {diaAbierto ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <button type="button" className="link-btn" onClick={() => setDiaAbierto(null)}>
                    ← {MESES[mesAbierto]}
                  </button>
                  <button type="button" className="icon-btn" title="Cerrar" onClick={cerrarCalendarioMes}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
                <div className="section-label" style={{ marginBottom: 10 }}>
                  {fmtFecha(diaAbierto)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(porDiaDelMesAbierto.get(diaAbierto) ?? []).map((item) => (
                    <div
                      key={`${item.tipoEquipo}-${item.equipoId}`}
                      className="list-item"
                      style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}
                    >
                      <div className="item-name">{item.texto}</div>
                      <div className="item-sub">
                        {item.tipoEquipoLabel} · {item.categoriaLabel} · {item.ubicacionLabel}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        <span className={`venc-badge ${BADGE_CLASE[item.urgencia]}`}>{item.mensaje}</span>
                        {item.esProgramada && (
                          <span className="chip">
                            <Icon name="calendar" size={11} /> {item.programacionEsManual ? "Programado (excepción)" : "Programado (auto)"}
                            {item.asignadoNombre ? ` · ${item.asignadoNombre}` : ""}
                          </span>
                        )}
                        {item.motivoLabel && (
                          <span className="venc-badge warn">
                            <Icon name="warning" size={11} /> Reprogramado: {item.motivoLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div className="section-label">
                    {MESES[mesAbierto]} {anioActual}
                  </div>
                  <button type="button" className="icon-btn" title="Cerrar" onClick={cerrarCalendarioMes}>
                    <Icon name="x" size={14} />
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 11 }}>
                  {DIAS_SEMANA.map((d, idx) => (
                    <div key={`dow-${idx}`} className="item-sub" style={{ textAlign: "center" }}>
                      {d}
                    </div>
                  ))}
                  {(() => {
                    const diasEnMes = new Date(anioActual, mesAbierto + 1, 0).getDate();
                    const primerDiaSemana = (new Date(anioActual, mesAbierto, 1).getDay() + 6) % 7;
                    const celdas = [];
                    for (let i = 0; i < primerDiaSemana; i++) celdas.push(<div key={`vacio-${i}`} />);
                    for (let dia = 1; dia <= diasEnMes; dia++) {
                      const fecha = `${anioActual}-${String(mesAbierto + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
                      const itemsDelDia = porDiaDelMesAbierto.get(fecha) ?? [];
                      celdas.push(
                        <button
                          type="button"
                          key={fecha}
                          disabled={itemsDelDia.length === 0}
                          onClick={() => setDiaAbierto(fecha)}
                          className="card"
                          style={{
                            margin: 0,
                            padding: "6px 2px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 2,
                            cursor: itemsDelDia.length > 0 ? "pointer" : "default",
                            opacity: itemsDelDia.length > 0 ? 1 : 0.5,
                          }}
                        >
                          <span>{dia}</span>
                          {itemsDelDia.length > 0 && (
                            <span
                              className={`venc-badge ${BADGE_CLASE[peorUrgencia(itemsDelDia)]}`}
                              style={{ padding: "0 5px", fontSize: 10 }}
                            >
                              {itemsDelDia.length}
                            </span>
                          )}
                        </button>,
                      );
                    }
                    return celdas;
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "realizados" && (
        <div className="card">
          <div className="panel-card-title">
            <h2>Mantenimientos realizados</h2>
            <span className="panel-card-count">{realizadosFiltrados.length} registros</span>
          </div>
          <div className="field" style={{ maxWidth: 320 }}>
            <input
              type="text"
              placeholder="Buscar por equipo, sitio o categoría..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>
          {realizadosFiltrados.length === 0 ? (
            <div className="empty-note">No hay mantenimientos registrados todavía.</div>
          ) : (
            <div className="detalle-table-wrap">
              <table className="detalle-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Equipo</th>
                    <th>Categoría</th>
                    <th>Sitio</th>
                    <th>Descripción</th>
                    <th>Realizó</th>
                  </tr>
                </thead>
                <tbody>
                  {realizadosFiltrados.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtFecha(r.fecha)}</td>
                      <td>{r.texto}</td>
                      <td>{r.categoriaLabel}</td>
                      <td>{r.ubicacionLabel}</td>
                      <td>{r.descripcion || "—"}</td>
                      <td>{r.realizadoPorNombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "dotacion" && (
        <div className="card">
          <div className="panel-card-title">
            <h2>Dotación estimada</h2>
            <span className="panel-card-count">{dotacion.totalTecnicos} técnicos en total (estimado)</span>
          </div>
          <div className="hint" style={{ margin: "-4px 0 12px" }}>
            Estimación, no una asignación de rutas real: por provincia, cuántas visitas al año hacen falta (según los intervalos
            configurados) y cuántas horas de viaje demanda la distancia REAL promedio entre los sitios de esa provincia (coordenadas GPS
            ya cargadas) — nunca una distancia inventada.{" "}
            {esAdmin ? (
              <button type="button" className="link-btn" onClick={() => setTab("configuracion")}>
                Ajustá los supuestos acá.
              </button>
            ) : (
              "Pedile a un Administrador que ajuste los supuestos."
            )}
          </div>
          {dotacion.porProvincia.length === 0 ? (
            <div className="empty-note">
              Todavía no hay intervalos configurados, o ningún sitio con equipos que los usen tiene GPS cargado.
            </div>
          ) : (
            <div className="detalle-table-wrap">
              <table className="detalle-table">
                <thead>
                  <tr>
                    <th>Provincia</th>
                    <th style={{ textAlign: "right" }}>Sitios</th>
                    <th style={{ textAlign: "right" }}>Visitas/año</th>
                    <th style={{ textAlign: "right" }}>Horas trabajo</th>
                    <th style={{ textAlign: "right" }}>Horas viaje</th>
                    <th style={{ textAlign: "right" }}>Horas totales</th>
                    <th style={{ textAlign: "right" }}>Técnicos</th>
                  </tr>
                </thead>
                <tbody>
                  {dotacion.porProvincia.map((p) => (
                    <tr key={p.provincia}>
                      <td>{p.provincia}</td>
                      <td style={{ textAlign: "right" }}>{p.sitios}</td>
                      <td style={{ textAlign: "right" }}>{p.visitasPorAnio}</td>
                      <td style={{ textAlign: "right" }}>{p.horasTrabajoAnio.toLocaleString("es-AR")}</td>
                      <td style={{ textAlign: "right" }}>{p.horasViajeAnio.toLocaleString("es-AR")}</td>
                      <td style={{ textAlign: "right" }}>{p.horasTotalesAnio.toLocaleString("es-AR")}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{p.tecnicosNecesarios}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="hint" style={{ marginTop: 12 }}>
            Supuestos actuales: {dotacion.supuestos.horasPorDia}h/día · {dotacion.supuestos.diasHabilesAnio} días hábiles/año ·{" "}
            {dotacion.supuestos.horasPorVisita}h de trabajo por visita · {dotacion.supuestos.velocidadKmh}km/h de viaje promedio.
          </div>
        </div>
      )}

      {tab === "configuracion" && esAdmin && (
        <MantenimientoConfigTab intervalos={intervalos} supuestosDotacion={supuestosDotacion} checklistItems={checklistItems} />
      )}
    </div>
  );
}
