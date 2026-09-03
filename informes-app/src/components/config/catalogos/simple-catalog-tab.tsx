"use client";

import { useState } from "react";
import { addSimpleCatalogItemAction, removeSimpleCatalogItemAction } from "@/app/(app)/configuracion/actions/catalogos";
import { Icon } from "@/components/icon";

export interface SimpleCatalogItem {
  id: string;
  nombre: string;
}

type SimpleCatalogTable = "catalogo_torres" | "catalogo_provincias" | "catalogo_tipos_informe" | "catalogo_categorias_gasto";

export function SimpleCatalogTab({
  tabla,
  items: initialItems,
  placeholder,
  hint,
}: {
  tabla: SimpleCatalogTable;
  items: SimpleCatalogItem[];
  placeholder: string;
  hint?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [nuevo, setNuevo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!nuevo.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addSimpleCatalogItemAction(tabla, nuevo);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar.");
      return;
    }
    setItems((prev) => [...prev, { id: crypto.randomUUID(), nombre: nuevo.trim() }]);
    setNuevo("");
  }

  async function remove(item: SimpleCatalogItem) {
    setBusy(true);
    const res = await removeSimpleCatalogItemAction(tabla, item.id, item.nombre);
    setBusy(false);
    if (res.success) setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  return (
    <div>
      {hint && (
        <div className="hint" style={{ margin: "-4px 0 12px" }}>
          {hint}
        </div>
      )}
      <div className="email-row">
        <input type="text" placeholder={placeholder} value={nuevo} onChange={(e) => setNuevo(e.target.value)} disabled={busy} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={busy}>
          + Agregar
        </button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="item-list" style={{ marginTop: 0 }}>
        {items.length === 0 ? (
          <div className="empty-note">Todavía no hay ítems.</div>
        ) : (
          items.map((i) => (
            <div className="list-item" key={i.id}>
              <div className="item-name">{i.nombre}</div>
              <button type="button" className="remove-btn" onClick={() => remove(i)} disabled={busy}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
