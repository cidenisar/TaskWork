"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { agregarCalibreCableAction, quitarCalibreCableAction } from "@/app/(app)/configuracion/actions/calibre-cable";
import { Icon } from "@/components/icon";

export interface CalibreCableItem {
  id: string;
  amperajeMax: number;
  calibreMm2: number;
}

/**
 * Qué sección de cable (mm²) corresponde al amperaje nominal de una
 * térmica/disyuntor — se usa para el esquema unifilar de Tableros. Es una
 * tabla de bandas ("hasta tantos A, tal calibre"), no una fórmula: nunca la
 * calcula la IA, la carga/ajusta un admin que conozca la norma real en uso
 * (acá viene precargada con valores de referencia AEA 90364/IRAM 2183 para
 * cobre con aislación PVC, método B1 — cable en caño, que es la instalación
 * más común en un tablero).
 */
export function CalibreCableTab({ items: initialItems }: { items: CalibreCableItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [amperajeMax, setAmperajeMax] = useState("");
  const [calibreMm2, setCalibreMm2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    if (!amperajeMax.trim() || !calibreMm2.trim()) return;
    setBusy(true);
    setError(null);
    const res = await agregarCalibreCableAction(amperajeMax, calibreMm2);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar.");
      return;
    }
    setAmperajeMax("");
    setCalibreMm2("");
    router.refresh();
  }

  async function quitar(id: string) {
    setBusy(true);
    setError(null);
    const res = await quitarCalibreCableAction(id);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo quitar.");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const ordenados = [...items].sort((a, b) => a.amperajeMax - b.amperajeMax);

  return (
    <div>
      <div className="hint" style={{ margin: "0 0 12px" }}>
        <Icon name="warning" size={13} /> Valores de referencia (cobre, aislación PVC, método B1 — cable en caño), precargados según AEA
        90364/IRAM 2183. El calibre real depende también del método de instalación y la temperatura ambiente — verificá estos valores
        contra la norma/criterio que usen en YPF antes de confiar en ellos para dimensionar cableado real.
      </div>
      <div className="detalle-table-wrap">
        <table className="detalle-table">
          <thead>
            <tr>
              <th>Hasta (A)</th>
              <th>Calibre (mm²)</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty-note">
                  Todavía no hay bandas configuradas.
                </td>
              </tr>
            ) : (
              ordenados.map((i) => (
                <tr key={i.id}>
                  <td>{i.amperajeMax}</td>
                  <td>{i.calibreMm2}</td>
                  <td>
                    <button type="button" className="remove-btn" onClick={() => quitar(i.id)} disabled={busy} aria-label="Quitar banda">
                      <Icon name="x" size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="tech-form-grid" style={{ marginTop: 10 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Hasta (A)</label>
          <input type="text" inputMode="decimal" placeholder="Ej: 32" value={amperajeMax} onChange={(e) => setAmperajeMax(e.target.value)} disabled={busy} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Calibre (mm²)</label>
          <input type="text" inputMode="decimal" placeholder="Ej: 6" value={calibreMm2} onChange={(e) => setCalibreMm2(e.target.value)} disabled={busy} />
        </div>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={agregar}
        disabled={busy || !amperajeMax.trim() || !calibreMm2.trim()}
        style={{ marginTop: 10 }}
      >
        + Agregar banda
      </button>
      {error && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
