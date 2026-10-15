"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarItemInspeccionIaAction, quitarItemInspeccionIaAction } from "@/app/(app)/configuracion/actions/inspeccion-ia";
import { Icon } from "@/components/icon";
import type { ModuloInspeccionIa } from "@/lib/database.types";

export interface InspeccionIaItem {
  id: string;
  orden: number;
  texto: string;
}

/**
 * Tab de Configuración → Catálogos para un módulo de Inspección IA — mismo
 * componente para los 4 módulos (Tableros, Racks, Equipos, Torres), cada
 * uno con su propio catálogo filtrado por `modulo`. Un Admin agrega/quita
 * ítems sin tocar código; la IA de ese módulo los evalúa contra las mismas
 * fotos que ya usa para identificar lo suyo (ver /api/<modulo>/leer-foto),
 * el técnico siempre confirma o corrige antes de guardar.
 */
export function InspeccionIaTab({ modulo, items: initialItems }: { modulo: ModuloInspeccionIa; items: InspeccionIaItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    if (!texto.trim()) return;
    setBusy(true);
    setError(null);
    const res = await agregarItemInspeccionIaAction(modulo, texto);
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
    const res = await quitarItemInspeccionIaAction(modulo, id);
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
        <Icon name="warning" size={13} /> Esta lista es la que la IA evalúa contra las fotos al leer este módulo — el técnico siempre
        confirma o corrige el resultado antes de guardar, nunca se guarda directo.
      </div>
      <div className="detalle-table-wrap">
        <table className="detalle-table">
          <thead>
            <tr>
              <th>Ítem a revisar</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={2} className="empty-note">
                  Todavía no hay ítems configurados.
                </td>
              </tr>
            ) : (
              ordenados.map((i) => (
                <tr key={i.id}>
                  <td>{i.texto}</td>
                  <td>
                    <button type="button" className="remove-btn" onClick={() => quitar(i.id)} disabled={busy} aria-label="Quitar ítem">
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
        <label style={{ fontSize: 12 }}>Nuevo ítem a revisar</label>
        <input
          type="text"
          placeholder="Ej: Térmica bypaseada/puenteada sin candado de bloqueo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={busy}
        />
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={agregar} disabled={busy || !texto.trim()} style={{ marginTop: 10 }}>
        + Agregar ítem
      </button>
      {error && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
