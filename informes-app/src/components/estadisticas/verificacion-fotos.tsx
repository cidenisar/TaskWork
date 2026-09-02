"use client";

import { useState } from "react";
import { verificarFotosInformeAction, type VerificacionResult } from "@/app/(app)/estadisticas/actions";

export interface InformeCandidato {
  id: string;
  numeroGeneracion: string;
  titulo: string;
}

export function VerificacionFotosCard({ candidatos }: { candidatos: InformeCandidato[] }) {
  const [resultados, setResultados] = useState<Record<string, VerificacionResult>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function analizar(id: string) {
    setBusyId(id);
    const res = await verificarFotosInformeAction(id);
    setBusyId(null);
    setResultados((prev) => ({ ...prev, [id]: res }));
  }

  return (
    <div className="card">
      <div className="section-label">🔍 Verificación de fotos vs. tarea declarada</div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Compara lo que muestran las fotos contra la descripción del trabajo, como control de calidad antes de
        enviar. Se analiza informe por informe (no corre automático) para no gastar de más.
      </div>
      {candidatos.length === 0 ? (
        <div className="empty-note">No hay informes recientes con fotos y descripción para analizar.</div>
      ) : (
        candidatos.map((c) => {
          const r = resultados[c.id];
          return (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div className="list-item" style={{ marginBottom: r ? 4 : 8 }}>
                <div className="item-name">
                  {c.numeroGeneracion} — {c.titulo}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => analizar(c.id)} disabled={busyId === c.id}>
                  {busyId === c.id ? "Analizando..." : "Analizar"}
                </button>
              </div>
              {r && (
                <div className="insight-item">
                  {r.success ? (
                    <>
                      {r.coincide ? "✅" : "⚠️"} <b>{c.numeroGeneracion}:</b> {r.comentario}
                    </>
                  ) : (
                    <span style={{ color: "var(--warn)" }}>⚠️ {r.error}</span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
