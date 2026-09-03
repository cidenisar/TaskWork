"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";

export function InsightsCard() {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/estadisticas/insights")
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "No se pudieron generar los insights.");
          return;
        }
        setInsights(data.insights);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo contactar al servicio de IA.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card">
      <div className="section-label">
        <Icon name="ai" size={15} /> Insights automáticos
      </div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Observaciones generadas por IA a partir de los datos reales del mes.
      </div>
      {error && <div className="error-text">{error}</div>}
      {!error && !insights && <div className="hint">Analizando los datos del mes...</div>}
      {insights?.map((line, i) => (
        <div className="insight-item" key={i}>
          {line}
        </div>
      ))}
    </div>
  );
}
