"use client";

import { useState } from "react";
import { agregarTipoAlarmaAction, toggleTipoAlarmaActivoAction } from "@/app/panel/guardia/parametros/tipos-alarma-actions";

interface TipoAlarma {
  id: string;
  nombre: string;
  activo: boolean;
}

export function TiposAlarmaCard({ tipos }: { tipos: TipoAlarma[] }) {
  const [lista, setLista] = useState(tipos);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    if (!nombreNuevo.trim()) return;
    setBusy(true);
    setError(null);
    const res = await agregarTipoAlarmaAction(nombreNuevo);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar.");
      return;
    }
    setLista((prev) => [...prev, { id: crypto.randomUUID(), nombre: nombreNuevo.trim(), activo: true }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setNombreNuevo("");
  }

  async function toggle(id: string, activo: boolean) {
    setBusyId(id);
    setError(null);
    const res = await toggleTipoAlarmaActivoAction(id, activo);
    setBusyId(null);
    if (!res.success) {
      setError(res.error || "No se pudo actualizar.");
      return;
    }
    setLista((prev) => prev.map((t) => (t.id === id ? { ...t, activo } : t)));
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-label">Tipos de alarma</div>
      <p className="empty-note">
        Categorías del selector al registrar una llamada. Quitar un tipo no borra los eventos ya registrados con él — solo deja de
        aparecer para eventos nuevos.
      </p>
      <div className="item-list" style={{ marginTop: 10 }}>
        {lista.map((t) => (
          <div className="list-item" key={t.id}>
            <div className="info">
              <div className="item-name" style={{ opacity: t.activo ? 1 : 0.5 }}>
                {t.nombre} {!t.activo && <span className="item-sub">(inactivo)</span>}
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => toggle(t.id, !t.activo)} disabled={busyId === t.id}>
              {t.activo ? "Quitar" : "Reactivar"}
            </button>
          </div>
        ))}
        {lista.length === 0 && <p className="empty-note">Todavía no hay tipos cargados.</p>}
      </div>
      <div className="tech-form-grid" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Nuevo tipo</label>
          <input
            type="text"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            disabled={busy}
          />
        </div>
      </div>
      <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} onClick={agregar} disabled={busy || !nombreNuevo.trim()}>
        {busy ? "Agregando..." : "Agregar tipo"}
      </button>
      {error && (
        <div className="error-text" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}
