"use client";

import { useState } from "react";
import { addTecnicoAction, removeTecnicoAction } from "@/app/(app)/configuracion/actions/catalogos";

export interface TecnicoItem {
  id: string;
  nombreCompleto: string;
  torre: string | null;
}

export function TecnicosTab({ tecnicos: initial, torres }: { tecnicos: TecnicoItem[]; torres: string[] }) {
  const [tecnicos, setTecnicos] = useState(initial);
  const [nombre, setNombre] = useState("");
  const [torre, setTorre] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!nombre.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addTecnicoAction(nombre, torre);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar.");
      return;
    }
    setTecnicos((prev) => [...prev, { id: crypto.randomUUID(), nombreCompleto: nombre.trim(), torre: torre.trim() || null }]);
    setNombre("");
    setTorre("");
  }

  async function remove(t: TecnicoItem) {
    setBusy(true);
    const res = await removeTecnicoAction(t.id, t.nombreCompleto);
    setBusy(false);
    if (res.success) setTecnicos((prev) => prev.filter((i) => i.id !== t.id));
  }

  return (
    <div>
      <div className="tech-form-grid">
        <input type="text" placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={busy} />
        <input type="text" list="config-torre-list" placeholder="Torre" value={torre} onChange={(e) => setTorre(e.target.value)} disabled={busy} />
      </div>
      <datalist id="config-torre-list">
        {torres.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={busy}>
        + Agregar al catálogo
      </button>
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}
      <div className="item-list">
        {tecnicos.length === 0 ? (
          <div className="empty-note">Todavía no hay técnicos en el catálogo.</div>
        ) : (
          tecnicos.map((t) => (
            <div className="list-item" key={t.id}>
              <div className="info">
                <div className="avatar">{(t.nombreCompleto[0] || "?").toUpperCase()}</div>
                <div>
                  <div className="item-name">{t.nombreCompleto}</div>
                  <div className="item-sub">{t.torre || "Sin torre asignada"}</div>
                </div>
              </div>
              <button type="button" className="remove-btn" onClick={() => remove(t)} disabled={busy}>
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
