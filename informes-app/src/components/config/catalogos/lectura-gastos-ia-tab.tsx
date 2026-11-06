"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarItemLecturaGastosIaAction, quitarItemLecturaGastosIaAction } from "@/app/(app)/configuracion/actions/lectura-gastos-ia";
import { Icon } from "@/components/icon";

export interface LecturaGastosIaItem {
  id: string;
  orden: number;
  texto: string;
}

/**
 * Tab de Configuración → Catálogos para la Lectura de Tickets con IA de
 * Rendición de Gastos — a diferencia de Inspección IA (un checklist de
 * bien/mal), acá cada ítem es una INSTRUCCIÓN en texto libre que se le suma
 * al prompt de lectura (ver /api/rendicion-gastos/leer-tickets), para que
 * un Admin pueda ajustar cómo categoriza o qué datos prioriza la IA sin
 * tocar código.
 */
export function LecturaGastosIaTab({ items: initialItems }: { items: LecturaGastosIaItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    if (!texto.trim()) return;
    setBusy(true);
    setError(null);
    const res = await agregarItemLecturaGastosIaAction(texto);
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
    const res = await quitarItemLecturaGastosIaAction(id);
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
        <Icon name="warning" size={13} /> Estas instrucciones se le suman al prompt cuando la IA lee tickets/comprobantes en &ldquo;Carga
        masiva con IA&rdquo; (Rendición de Gastos) — siempre revisás/corregís cada gasto detectado antes de guardarlo, la IA nunca carga
        directo.
      </div>
      <div className="detalle-table-wrap">
        <table className="detalle-table">
          <thead>
            <tr>
              <th>Instrucción</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={2} className="empty-note">
                  Todavía no hay instrucciones configuradas.
                </td>
              </tr>
            ) : (
              ordenados.map((i) => (
                <tr key={i.id}>
                  <td>{i.texto}</td>
                  <td>
                    <button type="button" className="remove-btn" onClick={() => quitar(i.id)} disabled={busy} aria-label="Quitar instrucción">
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
        <label style={{ fontSize: 12 }}>Nueva instrucción</label>
        <input
          type="text"
          placeholder='Ej: Si el ticket es de peaje o dice "AUSA", la categoría es "Peajes"'
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={busy}
        />
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={agregar} disabled={busy || !texto.trim()} style={{ marginTop: 10 }}>
        + Agregar instrucción
      </button>
      {error && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
