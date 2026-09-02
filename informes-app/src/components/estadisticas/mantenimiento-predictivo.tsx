import type { AlertaUbicacion } from "@/lib/estadisticas/aggregates";

export function MantenimientoPredictivoCard({ alertas }: { alertas: AlertaUbicacion[] }) {
  return (
    <div className="card">
      <div className="section-label">🔧 Mantenimiento predictivo</div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Cruza ubicación + frecuencia de los informes técnicos para anticipar dónde puede repetirse una falla.
      </div>
      {alertas.length === 0 ? (
        <div className="empty-note">Sin ubicaciones con intervenciones repetidas en los últimos 90 días.</div>
      ) : (
        alertas.map((a) => (
          <div className="insight-item" key={a.ubicacion}>
            {a.urgencia === "danger" ? "🔴" : "🟡"} <b>{a.ubicacion}:</b> {a.mensaje}
          </div>
        ))
      )}
    </div>
  );
}
