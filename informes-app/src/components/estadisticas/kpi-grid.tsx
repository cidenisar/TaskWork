import type { EstadisticasBase } from "@/lib/estadisticas/aggregates";

function fmtMoney(n: number) {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function KpiGrid({ kpis }: { kpis: EstadisticasBase["kpis"] }) {
  const gastado =
    kpis.gastadoEsteMesUsd > 0
      ? `ARS ${fmtMoney(kpis.gastadoEsteMesArs)} · USD ${fmtMoney(kpis.gastadoEsteMesUsd)}`
      : `ARS ${fmtMoney(kpis.gastadoEsteMesArs)}`;

  return (
    <div className="kpi-grid">
      <div className="kpi-card">
        <div className="kpi-value">{kpis.informesEsteMes}</div>
        <div className="kpi-label">Informes este mes</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-value" style={{ fontSize: kpis.gastadoEsteMesUsd > 0 ? 15 : 22 }}>
          {gastado}
        </div>
        <div className="kpi-label">Gastado este mes</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-value">{kpis.tecnicosActivos}</div>
        <div className="kpi-label">Técnicos activos</div>
      </div>
      <div className="kpi-card">
        <div className="kpi-value">{kpis.rendicionesSinCerrar}</div>
        <div className="kpi-label">Rendiciones sin cerrar</div>
      </div>
    </div>
  );
}
