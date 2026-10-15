import { createClient } from "@/lib/supabase/server";
import { getPanelOverview } from "@/lib/panel/overview";
import { filtrarSitios, agruparPor, localidadKey, type FiltrosJerarquia } from "@/lib/panel/jerarquia";
import { JerarquiaBreadcrumb } from "@/components/panel/jerarquia-breadcrumb";
import { JerarquiaNodos } from "@/components/panel/jerarquia-nodos";
import { JerarquiaSitioPicker } from "@/components/panel/jerarquia-sitio-picker";
import { SitioDetalleCard } from "@/components/panel/sitio-detalle-card";

function fmtHoy(): string {
  return new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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
  const supabase = await createClient();
  const overview = await getPanelOverview(supabase);
  const { kpis, equipoPorModulo, sitios, vencimientos } = overview;

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

      <div className="kpi-grid">
        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Equipamiento relevado</div>
          <div className="kpi-multi-rows">
            {equipoPorModulo.map((m) => (
              <div className="kpi-multi-row" key={m.modulo}>
                <span className="kpi-multi-num">{m.cantidad}</span>
                <span className="kpi-multi-label">{m.modulo}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Informes</div>
          <div className="kpi-multi-rows">
            {kpis.informesPorTipo.map((i) => (
              <div className="kpi-multi-row" key={i.label}>
                <span className="kpi-multi-num">{i.cantidad}</span>
                <span className="kpi-multi-label">{i.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Personal y flota</div>
          <div className="kpi-multi-rows">
            <div className="kpi-multi-row">
              <span className="kpi-multi-num">{kpis.tecnicosActivos}</span>
              <span className="kpi-multi-label">Técnicos activos</span>
            </div>
            <div className="kpi-multi-row">
              <span className="kpi-multi-num">{kpis.vehiculosTotal}</span>
              <span className="kpi-multi-label">Vehículos</span>
            </div>
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Plan de Mantenimiento</div>
          <div className="kpi-multi-rows">
            <div className="kpi-multi-row">
              <span className="kpi-multi-num" style={{ color: "var(--ok)" }}>
                {kpis.mantenimiento.hechos}
              </span>
              <span className="kpi-multi-label">Al día</span>
            </div>
            <div className="kpi-multi-row">
              <span className="kpi-multi-num">{kpis.mantenimiento.porHacer}</span>
              <span className="kpi-multi-label">Por hacer</span>
            </div>
            <div className="kpi-multi-row">
              <span className="kpi-multi-num" style={{ color: kpis.mantenimiento.vencidos > 0 ? "var(--accent-2)" : undefined }}>
                {kpis.mantenimiento.vencidos}
              </span>
              <span className="kpi-multi-label">Vencidos</span>
            </div>
            <div className="kpi-multi-row">
              <span className="kpi-multi-num">{kpis.mantenimiento.reprogramados}</span>
              <span className="kpi-multi-label">Reprogramados</span>
            </div>
          </div>
        </div>
      </div>

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
