import type { ComparacionTorre } from "@/lib/estadisticas/aggregates";

export function ComparacionCard({ grupos }: { grupos: ComparacionTorre[] }) {
  return (
    <div className="card">
      <div className="section-label">⚖️ Comparación entre técnicos similares</div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Agrupa por torre y compara contra el promedio del grupo este mes — para entender carga de trabajo, no para
        sancionar.
      </div>
      {grupos.length === 0 ? (
        <div className="empty-note">Todavía no hay suficientes datos este mes para comparar grupos.</div>
      ) : (
        grupos.map((g) => {
          const max = Math.max(...g.tecnicos.map((t) => t.informes), 1);
          return (
            <div key={g.torre} style={{ marginBottom: 16 }}>
              <div className="compare-head">
                <span>{g.torre}</span>
                <span>Promedio: {g.promedioInformes.toFixed(1)} inf.</span>
              </div>
              {g.tecnicos.map((t) => (
                <div className="bar-row" key={t.nombre}>
                  <div className="bar-label">{t.nombre}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(4, Math.round((t.informes / max) * 100))}%` }} />
                  </div>
                  <div className="bar-val">{t.informes} inf.</div>
                </div>
              ))}
              {g.outlier && <div className="insight-item" style={{ marginTop: 8 }}>📊 {g.outlier.mensaje}</div>}
            </div>
          );
        })
      )}
    </div>
  );
}
