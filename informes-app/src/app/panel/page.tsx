import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPanelOverview } from "@/lib/panel/overview";
import { filtrarSitios, agruparPor, localidadKey, type FiltrosJerarquia } from "@/lib/panel/jerarquia";
import { JerarquiaBreadcrumb } from "@/components/panel/jerarquia-breadcrumb";
import { JerarquiaNodos } from "@/components/panel/jerarquia-nodos";
import { JerarquiaSitioPicker } from "@/components/panel/jerarquia-sitio-picker";
import { SitioDetalleCard } from "@/components/panel/sitio-detalle-card";
import { EstadoViajeBadge } from "@/components/riesgo-viaje/badges";
import { CerrarViajeButton } from "@/components/riesgo-viaje/cerrar-viaje-button";
import { getNovedadesGuardiaHoy } from "@/lib/panel/novedades-guardia";
import { cargarResumenTareasPanel } from "@/lib/tareas/resumen-panel";
import { diasDesde, DIAS_TAREA_VIEJA } from "@/lib/tareas/puro";
import { calcularDemora, formatearDemora, HORAS_TOPE_SIN_LLEGADA_ESTIMADA } from "@/lib/riesgo-viaje/demora";
import { StatusDot } from "@/components/icon";

function fmtHoy(): string {
  return new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fmtFechaHora(fechaHora: string): string {
  const d = new Date(fechaHora);
  return `${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
}

function fmtHora(fechaHora: string): string {
  return new Date(fechaHora).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

/** A dónde lleva cada renglón de "Equipamiento relevado" — su propio historial. */
const HISTORIAL_POR_MODULO: Record<string, string> = {
  Tableros: "/tableros/historial",
  Racks: "/racks/historial",
  Torres: "/torres-comunicacion/historial",
  "Equipos Individuales": "/equipos/historial",
  Salas: "/salas/historial",
};

/** A dónde lleva cada renglón de "Informes" — su propio historial. */
const HISTORIAL_POR_INFORME: Record<string, string> = {
  "Informe Técnico": "/informe-tecnico/historial",
  "Rendición de Gastos": "/rendicion-gastos/historial",
  "Entregas a Depósito": "/entregas-deposito/historial",
  "Bajas de Equipamiento": "/bajas/historial",
};

/** Fila de un cuadro "kpi-card-multi" — si hay href, lleva a donde corresponde ese dato (historial, Plan de Mantenimiento, etc). */
function FilaKpi({ num, label, color, href }: { num: number; label: string; color?: string; href?: string }) {
  const contenido = (
    <>
      <span className="kpi-multi-num" style={color ? { color } : undefined}>
        {num}
      </span>
      <span className="kpi-multi-label">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="kpi-multi-row kpi-multi-row-link">
      {contenido}
    </Link>
  ) : (
    <div className="kpi-multi-row">{contenido}</div>
  );
}

interface PanelSearchParams {
  region?: string;
  provincia?: string;
  localidad?: string;
  sitio?: string;
  id?: string;
}

/**
 * Vista General ya no es una tabla plana de sitios — es un drill-down por
 * la jerarquía de Ubicaciones (región → provincia → localidad → sitio),
 * un nivel por vez con breadcrumb, usando los filtros de la URL
 * (searchParams). Cada nivel intermedio agrega lo que cuelga debajo
 * (consumo, cantidad de sitios/equipamiento, mantenimiento vencido); el
 * nivel final muestra el detalle de un sitio puntual, con la última visita
 * junto al estado del Plan de Mantenimiento (no tiene sentido mostrarla
 * suelta en un sitio sin mantenimiento configurado). Los 4 cuadros
 * superiores y "Vencimientos de flota" se quedan como resumen global — ni
 * el equipamiento agregado ni los vencimientos de técnicos/vehículos se
 * pueden repartir por zona.
 */
export default async function PanelPage({ searchParams }: { searchParams: Promise<PanelSearchParams> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();
  const [overview, novedadesGuardia, tareas] = await Promise.all([
    getPanelOverview(supabase, profile.rol !== "tecnico"),
    getNovedadesGuardiaHoy(supabase),
    // Tareas pendientes: solo para la oficina (la pantalla a la que lleva es de Admin/Supervisor).
    profile.rol !== "tecnico" ? cargarResumenTareasPanel(supabase) : Promise.resolve(null),
  ]);
  const ahora = new Date();
  const { kpis, equipoPorModulo, sitios, vencimientos, mantenimientoPendiente, viajesActivos: viajesSinOrdenar, guardiaAhora } = overview;
  // Los viajes que se pasaron de su horario van primero y en alarma.
  const viajesActivos = viajesSinOrdenar
    .map((v) => ({ ...v, demora: calcularDemora({ estado: v.estado, llegadaEstimadaAt: v.llegadaEstimadaAt, iniciadoAt: v.iniciadoAt, fechaHora: v.fechaHora }, ahora) }))
    .sort((a, b) => Number(b.demora.demorado) - Number(a.demora.demorado) || b.demora.horasDeDemora - a.demora.horasDeDemora);
  const viajesDemorados = viajesActivos.filter((v) => v.demora.demorado).length;
  // Cerrar el seguimiento de un viaje: quien lo cargó o Admin/Supervisor/Superusuario — acá solo se ofrece a estos últimos (la acción valida igual).
  const puedeCerrarViajes = profile.rol === "admin" || profile.rol === "supervisor" || profile.rol === "superusuario";

  const filtros: FiltrosJerarquia = { region: sp.region, provincia: sp.provincia, localidad: sp.localidad, sitio: sp.sitio };
  const filtrados = filtrarSitios(sitios, filtros);

  let contenido: React.ReactNode;
  if (filtros.sitio) {
    const candidato = sp.id ? filtrados.find((s) => s.id === sp.id) : filtrados.length === 1 ? filtrados[0] : undefined;
    if (candidato) {
      contenido = <SitioDetalleCard sitio={candidato} />;
    } else if (filtrados.length === 0) {
      contenido = <div className="empty-note">No se encontró equipamiento para este sitio.</div>;
    } else {
      contenido = <JerarquiaSitioPicker sitios={filtrados} filtros={filtros} />;
    }
  } else {
    const paramSiguiente: keyof FiltrosJerarquia = !filtros.region ? "region" : !filtros.provincia ? "provincia" : !filtros.localidad ? "localidad" : "sitio";
    const clave =
      paramSiguiente === "region"
        ? (s: (typeof filtrados)[number]) => s.region
        : paramSiguiente === "provincia"
          ? (s: (typeof filtrados)[number]) => s.provincia
          : paramSiguiente === "localidad"
            ? localidadKey
            : (s: (typeof filtrados)[number]) => s.sitioNombre;
    const nodos = agruparPor(filtrados, clave);
    contenido = <JerarquiaNodos nodos={nodos} filtrosBase={filtros} paramSiguiente={paramSiguiente} />;
  }

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Vista general</h1>
          <p>Zonas, sitios, consumo y vencimientos de un vistazo</p>
        </div>
        <div className="panel-topbar-meta">{fmtHoy()}</div>
      </div>

      <div className={tareas ? "kpi-grid kpi-grid-5" : "kpi-grid"}>
        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Equipamiento relevado</div>
          <div className="kpi-multi-rows">
            {equipoPorModulo.map((m) => (
              <FilaKpi key={m.modulo} num={m.cantidad} label={m.modulo} href={HISTORIAL_POR_MODULO[m.modulo]} />
            ))}
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Informes</div>
          <div className="kpi-multi-rows">
            {kpis.informesPorTipo.map((i) => (
              <FilaKpi key={i.label} num={i.cantidad} label={i.label} href={HISTORIAL_POR_INFORME[i.label]} />
            ))}
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Personal y flota</div>
          <div className="kpi-multi-rows">
            <FilaKpi num={kpis.tecnicosActivos} label="Técnicos activos" />
            <FilaKpi num={kpis.vehiculosTotal} label="Vehículos" href="/panel/vehiculos" />
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Plan de Mantenimiento</div>
          <div className="kpi-multi-rows">
            <FilaKpi num={kpis.mantenimiento.hechos} label="Al día" color="var(--ok)" />
            <FilaKpi num={kpis.mantenimiento.porHacer} label="Por hacer" href="/panel/mantenimientos?filtro=porHacer" />
            <FilaKpi
              num={kpis.mantenimiento.vencidos}
              label="Vencidos"
              color={kpis.mantenimiento.vencidos > 0 ? "var(--accent-2)" : undefined}
              href="/panel/mantenimientos?filtro=vencido"
            />
            <FilaKpi num={kpis.mantenimiento.reprogramados} label="Reprogramados" href="/panel/mantenimientos?filtro=reprogramado" />
          </div>
        </div>

        {tareas && (
          <div className="kpi-card kpi-card-multi">
            <div className="kpi-multi-title">Tareas pendientes</div>
            <div className="kpi-multi-rows">
              <FilaKpi num={tareas.abiertas} label="Abiertas" href="/panel/tareas" />
              <FilaKpi
                num={tareas.viejas}
                label={`Con más de ${DIAS_TAREA_VIEJA} días`}
                color={tareas.viejas > 0 ? "var(--accent-2)" : undefined}
                href="/panel/tareas"
              />
              <FilaKpi num={tareas.resueltasRecientes} label="Resueltas (30 días)" color="var(--ok)" href="/panel/tareas?estado=cerradas" />
              <FilaKpi num={tareas.bajasRecientes} label="Dadas de baja (30 días)" href="/panel/tareas?estado=cerradas" />
            </div>
          </div>
        )}
      </div>

      <div className="panel-grid-3">
        <div className="card">
          <div className="panel-card-title">
            <h2>Riesgo de Viaje — en curso</h2>
            <Link href="/panel/riesgo-viaje/nueva" className="btn btn-primary btn-sm">
              + Nueva evaluación
            </Link>
          </div>
          {viajesDemorados > 0 && (
            <div className="venc-badge danger" style={{ marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <StatusDot tone="danger" /> {viajesDemorados} viaje{viajesDemorados === 1 ? "" : "s"} fuera de horario — sin marcar que llegó
            </div>
          )}
          {viajesActivos.length === 0 ? (
            <div className="empty-note">No hay viajes en curso en este momento.</div>
          ) : (
            <div>
              {viajesActivos.map((v) => (
                <div className="panel-venc-row" key={v.id} style={v.demora.demorado ? { background: "color-mix(in srgb, var(--danger, #ff3d3d) 10%, transparent)" } : undefined}>
                  <div className="panel-venc-info">
                    <div className="panel-venc-nombre">
                      {v.conductorNombre} · {v.patente}
                    </div>
                    <div className="panel-venc-tipo">
                      {v.origen} → {v.destino} · {fmtFechaHora(v.fechaHora)}
                    </div>
                    {v.demora.demorado && (
                      <div className="panel-venc-tipo" style={{ color: "var(--danger, #ff3d3d)", fontWeight: 600 }}>
                        {v.demora.porLlegadaEstimada
                          ? `Debía llegar ${fmtFechaHora(v.llegadaEstimadaAt!)} — se pasó ${formatearDemora(v.demora.horasDeDemora)}`
                          : `Hace más de ${HORAS_TOPE_SIN_LLEGADA_ESTIMADA} h en viaje (sin hora de llegada cargada) — ${formatearDemora(v.demora.horasDeDemora)} de más`}
                      </div>
                    )}
                  </div>
                  <div className="panel-venc-dias" style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    {v.demora.demorado && (
                      <span className="venc-badge danger">
                        <StatusDot tone="danger" /> DEMORADO
                      </span>
                    )}
                    <EstadoViajeBadge estado={v.estado} />
                    {puedeCerrarViajes && <CerrarViajeButton evaluacionId={v.id} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="panel-card-title">
            <h2>Guardia ahora</h2>
            <Link href="/panel/guardia/cronograma" className="panel-card-count">
              ver cronograma →
            </Link>
          </div>
          <div>
            {guardiaAhora.map((g) => (
              <div className="panel-venc-row" key={g.area}>
                <div className="panel-venc-info">
                  <div className="panel-venc-nombre">{g.area}</div>
                </div>
                <div className="panel-venc-dias">
                  {g.nombre ? <span className="venc-badge ok">{g.nombre}</span> : <span className="venc-badge warn">Sin asignar</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="panel-card-title">
            <h2>Mantenimiento pendiente</h2>
            <Link href="/panel/mantenimientos" className="panel-card-count">
              ver Plan completo →
            </Link>
          </div>
          {mantenimientoPendiente.length === 0 ? (
            <div className="empty-note">No hay nada vencido ni próximo a vencer.</div>
          ) : (
            <div>
              {mantenimientoPendiente.map((m, i) => (
                <div className="panel-venc-row" key={i}>
                  <div className="panel-venc-info">
                    <div className="panel-venc-nombre">{m.texto}</div>
                    <div className="panel-venc-tipo">
                      {m.tipoEquipoLabel} · {m.categoriaLabel} · {m.ubicacionLabel}
                    </div>
                  </div>
                  <div className="panel-venc-dias">
                    <span className={`venc-badge ${m.urgencia === "vencido" ? "danger" : "warn"}`}>{m.mensaje}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="panel-card-title">
          <h2>Novedades de guardia — hoy</h2>
          <span className="panel-card-count">
            {novedadesGuardia.length} novedad{novedadesGuardia.length === 1 ? "" : "es"}
          </span>
        </div>
        {novedadesGuardia.length === 0 ? (
          <div className="empty-note">Sin novedades de guardia hoy, en ninguna de las cuatro áreas.</div>
        ) : (
          <div>
            {novedadesGuardia.map((n) => (
              <Link href={`/guardia/evento/${n.eventoId}`} className="panel-venc-row panel-venc-row-link" key={n.id}>
                <div className="panel-venc-info">
                  <div className="panel-venc-nombre">{n.texto}</div>
                  <div className="panel-venc-tipo">
                    Evento #{n.eventoNumero} · {n.tipoAlarma} · {n.sitio}
                  </div>
                </div>
                <div className="panel-venc-dias">
                  <span className={`venc-badge ${n.estadoEvento === "abierto" ? "warn" : "ok"}`}>{fmtHora(n.at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {tareas && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="panel-card-title">
            <h2>Últimas tareas cargadas</h2>
            <Link href="/panel/tareas" className="panel-card-count">
              ver todas →
            </Link>
          </div>
          {tareas.ultimas.length === 0 ? (
            <div className="empty-note">Todavía no se cargó ninguna tarea.</div>
          ) : (
            <div>
              {tareas.ultimas.map((t) => {
                const dias = diasDesde(t.creadaAt, ahora);
                return (
                  <div className="panel-venc-row" key={t.id}>
                    <div className="panel-venc-info">
                      <div className="panel-venc-nombre">{t.texto}</div>
                      <div className="panel-venc-tipo">
                        {t.lugar} · {t.informeNumero ? `Informe ${t.informeNumero}` : "cargada a mano"}
                      </div>
                    </div>
                    <div className="panel-venc-dias">
                      <span className={`venc-badge ${t.estado === "abierta" ? "warn" : "ok"}`}>
                        {t.estado === "abierta" ? (dias === 0 ? "hoy" : `hace ${dias} d`) : t.estado === "resuelta" ? "resuelta" : "dada de baja"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="panel-grid-2">
        <div className="card">
          <div className="panel-card-title">
            <h2>Sitios por zona</h2>
            <span className="panel-card-count">
              {kpis.totalSitios} sitio{kpis.totalSitios === 1 ? "" : "s"}
              {kpis.consumoTotalW != null && ` · ${Math.round(kpis.consumoTotalW).toLocaleString("es-AR")} W estimados en total`}
            </span>
          </div>
          <div className="hint" style={{ margin: "-4px 0 10px" }}>
            El consumo es lo que la IA estimó al identificar marca/modelo de cada equipo, no una medición real — los equipos sin
            marca/modelo reconocido no suman al total.
          </div>
          <JerarquiaBreadcrumb filtros={filtros} />
          {contenido}
        </div>

        <div>
          <div className="card">
            <div className="panel-card-title">
              <h2>Vencimientos de flota</h2>
              <span className="panel-card-count">próximos {"≤"} 60 días o vencidos</span>
            </div>
            {vencimientos.length === 0 ? (
              <div className="empty-note">No hay vencimientos próximos ni vencidos cargados.</div>
            ) : (
              <div>
                {vencimientos.map((v, i) => (
                  <div className="panel-venc-row" key={`${v.tipo}-${v.nombre}-${i}`}>
                    <div className="panel-venc-info">
                      <div className="panel-venc-nombre">{v.nombre}</div>
                      <div className="panel-venc-tipo">{v.tipo}</div>
                    </div>
                    <div className="panel-venc-dias">
                      <span className={`venc-badge ${v.urgencia === "vencido" ? "danger" : "warn"}`}>
                        {v.urgencia === "vencido" ? `Vencido hace ${Math.abs(v.diasRestantes)}d` : `Vence en ${v.diasRestantes}d`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
