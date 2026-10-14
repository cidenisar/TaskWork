"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarHallazgoSeguridadAction, quitarHallazgoSeguridadAction } from "@/app/(app)/configuracion/actions/hallazgos-seguridad-tablero";
import { Icon } from "@/components/icon";

export interface HallazgoSeguridadItem {
  id: string;
  orden: number;
  texto: string;
}

/**
 * Catálogo de qué revisar en la foto del tablero además de los circuitos
 * (ej. "Térmica bypaseada sin candado") — la IA evalúa cada ítem contra
 * las fotos al leerlas (ver /api/tableros/leer-foto), el técnico confirma
 * o corrige en el formulario. Igual criterio que el checklist de
 * mantenimiento: catálogo abierto, un Admin agrega/quita sin tocar código.
 */
export function HallazgosSeguridadTab({ items: initialItems }: { items: HallazgoSeguridadItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    if (!texto.trim()) return;
    setBusy(true);
    setError(null);
    const res = await agregarHallazgoSeguridadAction(texto);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar.");
      return;
    }
    setTexto("");
    router.refresh();
  }

  async function quitar(id: string) {
    setBusy(true);
    setError(null);
    const res = await quitarHallazgoSeguridadAction(id);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo quitar.");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const ordenados = [...items].sort((a, b) => a.orden - b.orden);

  return (
    <div>
      <div className="hint" style={{ margin: "0 0 12px" }}>
        <Icon name="warning" size={13} /> Esta lista es la que la IA evalúa contra las fotos al leer un tablero (Nueva Medición) — el
        técnico siempre confirma o corrige el resultado antes de guardar, nunca se guarda directo.
      </div>
      <div className="detalle-table-wrap">
        <table className="detalle-table">
          <thead>
            <tr>
              <th>Hallazgo a revisar</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={2} className="empty-note">
                  Todavía no hay hallazgos configurados.
                </td>
              </tr>
            ) : (
              ordenados.map((i) => (
                <tr key={i.id}>
                  <td>{i.texto}</td>
                  <td>
                    <button type="button" className="remove-btn" onClick={() => quitar(i.id)} disabled={busy} aria-label="Quitar hallazgo">
                      <Icon name="x" size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
        <label style={{ fontSize: 12 }}>Nuevo hallazgo a revisar</label>
        <input
          type="text"
          placeholder="Ej: Térmica bypaseada/puenteada sin candado de bloqueo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={busy}
        />
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={agregar} disabled={busy || !texto.trim()} style={{ marginTop: 10 }}>
        + Agregar hallazgo
      </button>
      {error && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
