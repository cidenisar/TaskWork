"use client";

import { useState } from "react";
import { responderCambioAction } from "@/app/(app)/guardia/actions";
import type { AreaGuardia } from "@/lib/guardia/cronograma";

export interface CambioPendiente {
  id: string;
  area: AreaGuardia;
  original: string;
  desde: string;
  hasta: string;
  motivo: string | null;
}

export function CambiosPendientes({ cambios: iniciales }: { cambios: CambioPendiente[] }) {
  const [cambios, setCambios] = useState(iniciales);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function responder(id: string, respuesta: "aceptado" | "rechazado") {
    setBusyId(id);
    setError(null);
    const res = await responderCambioAction(id, respuesta);
    setBusyId(null);
    if (!res.success) {
      setError(res.error || "No se pudo responder.");
      return;
    }
    setCambios((prev) => prev.filter((c) => c.id !== id));
  }

  if (cambios.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-label">Te piden asumir una guardia</div>
      {error && <div className="error-text">{error}</div>}
      <div className="item-list">
        {cambios.map((c) => (
          <div className="list-item" key={c.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <div className="info">
              <div>
                <div className="item-name">
                  {c.area} · {c.desde} → {c.hasta}
                </div>
                <div className="item-sub">
                  {c.original} no puede{c.motivo ? ` · ${c.motivo}` : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => responder(c.id, "aceptado")} disabled={busyId === c.id}>
                Asumo la guardia
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => responder(c.id, "rechazado")} disabled={busyId === c.id}>
                No puedo
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
