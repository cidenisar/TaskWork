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
                <div key={nombreMes} className="card" style={{ margin: 0, padding: 12 }}>
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
                </div>
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
