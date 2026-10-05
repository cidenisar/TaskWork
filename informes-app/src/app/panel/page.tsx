import { createClient } from "@/lib/supabase/server";
import { getPanelOverview } from "@/lib/panel/overview";
import { BarList } from "@/components/estadisticas/bar-list";
import { SitiosTable } from "@/components/panel/sitios-table";

function fmtHoy(): string {
  return new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default async function PanelPage() {
  const supabase = await createClient();
  const overview = await getPanelOverview(supabase);
  const { kpis, equipoPorModulo, sitios, vencimientos } = overview;

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Vista general</h1>
          <p>Sitios, equipamiento y vencimientos de un vistazo</p>
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
          <div className="kpi-label">Vencimientos próximos/vencidos</div>
        </div>
      </div>

      <div className="panel-grid-2">
        <div className="card">
          <div className="panel-card-title">
            <h2>Sitios con equipamiento</h2>
            <span className="panel-card-count">{sitios.length} sitio{sitios.length === 1 ? "" : "s"}</span>
          </div>
          {sitios.length === 0 ? (
            <div className="empty-note">Todavía no hay equipamiento cargado en ningún sitio.</div>
          ) : (
            <SitiosTable sitios={sitios} />
          )}
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
              <h2>Vencimientos</h2>
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
