"use client";

import { useState } from "react";
import { setResumenSemanalIaAction } from "@/app/(app)/configuracion/actions/historial";

const EJEMPLO = `Resumen semanal — 25 al 29 de agosto

4 informes generados esta semana:
• Instalación de AA Sala de Energía (YPF) — Cabrejas Rodrigo, Pougetoux Lucas
• Mantenimiento preventivo tablero (YPF) — Aguilera Diego
• Inspección sala de servidores (CILC) — Cabrejas Rodrigo
• Tendido de cableado señal (YPF) — Pougetoux Lucas, Aguilera Diego

Sin tareas pendientes registradas en 3 de los 4 informes.
Recordatorio: tenés 4 informes de la semana pasada sin archivar todavía.`;

export function ResumenSemanalCard({ activo: initialActivo }: { activo: boolean }) {
  const [activo, setActivo] = useState(initialActivo);
  const [showPreview, setShowPreview] = useState(false);

  async function toggle() {
    const next = !activo;
    setActivo(next);
    const res = await setResumenSemanalIaAction(next);
    if (!res.success) setActivo(!next);
  }

  return (
    <div className="card">
      <div className="section-label">Resumen semanal por IA</div>
      <div className="switch-row" style={{ paddingTop: 0 }}>
        <div className="txt">
          <b>Mandar un resumen automático los lunes</b>
          <span>La IA arma un mail con los informes generados la semana anterior</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={activo} onChange={toggle} />
          <span className="slider"></span>
        </label>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPreview((v) => !v)}>
        👁 Ver un ejemplo
      </button>
      {showPreview && (
        <div style={{ marginTop: 14 }}>
          <div className="desc-box" style={{ whiteSpace: "pre-line", fontSize: 13 }}>
            {EJEMPLO}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Ejemplo estático para mostrar el formato — en la app real lo arma la IA con los datos reales de la
            semana (todavía no implementado; queda para una próxima iteración).
          </div>
        </div>
      )}
    </div>
  );
}
