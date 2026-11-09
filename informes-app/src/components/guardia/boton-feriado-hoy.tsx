"use client";

import { useState } from "react";
import { marcarFeriadoHoyAction } from "@/app/(app)/guardia/actions";
import { Icon } from "@/components/icon";

export function BotonFeriadoHoy({ yaMarcado }: { yaMarcado: boolean }) {
  const [marcado, setMarcado] = useState(yaMarcado);
  const [nombre, setNombre] = useState("");
  const [editando, setEditando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (marcado) {
    return (
      <div className="list-item">
        <Icon name="calendar" size={14} /> Hoy ya está marcado como feriado
      </div>
    );
  }

  if (!editando) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setEditando(true)}>
        <Icon name="calendar" size={14} /> Marcar hoy como feriado
      </button>
    );
  }

  async function confirmar() {
    setBusy(true);
    setError(null);
    const res = await marcarFeriadoHoyAction(nombre);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo marcar.");
      return;
    }
    setMarcado(true);
  }

  return (
    <div className="card" style={{ background: "var(--panel-2)" }}>
      <div className="field">
        <label>Nombre del feriado (opcional)</label>
        <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={busy} />
      </div>
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={confirmar} disabled={busy}>
          {busy ? "Guardando..." : "Confirmar"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditando(false)} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
