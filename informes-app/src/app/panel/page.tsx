import { createClient } from "@/lib/supabase/server";
import { getPanelOverview } from "@/lib/panel/overview";
import { filtrarSitios, agruparPor, localidadKey, type FiltrosJerarquia } from "@/lib/panel/jerarquia";
import { BarList } from "@/components/estadisticas/bar-list";
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
 * (consumo, cantidad de sitios/equipamiento, mantenimiento vencido, última
 * visita); el nivel final muestra el detalle de un sitio puntual. Todo lo
 * demás (KPIs, Equipamiento por módulo, Vencimientos de flota) se queda
 * como un resumen global — los vencimientos de técnicos/vehículos no están
 * atados a un sitio, no se pueden repartir por zona.
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
        <div className="kpi-card">
          <div className="kpi-value">{kpis.totalSitios}</div>
          <div className="kpi-label">Sitios con equipamiento</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{kpis.totalEquipamiento}</div>
          <div className="kpi-label">Equipamiento total</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{kpis.tecnicosActivos}</div>
          <div className="kpi-label">Técnicos activos</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: kpis.vencimientosProximos > 0 ? "var(--warn)" : undefined }}>
            {kpis.vencimientosProximos}
          </div>
          <div className="kpi-label">Vencimientos de flota próximos/vencidos</div>
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
              <h2>Equipamiento por módulo</h2>
            </div>
            <BarList
              items={equipoPorModulo.map((m) => ({ label: m.modulo, value: m.cantidad, displayValue: String(m.cantidad) }))}
            />
          </div>

          <div className="card" style={{ marginTop: 16 }}>
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
