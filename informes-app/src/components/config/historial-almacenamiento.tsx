"use client";

import { useState } from "react";
import { setUmbralAvisoAction, setRecordatorioSemanalAction } from "@/app/(app)/configuracion/actions/historial";
import type { UmbralAviso } from "@/lib/database.types";

export function HistorialAlmacenamientoCard({
  umbral: initialUmbral,
  recordatorio: initialRecordatorio,
}: {
  umbral: UmbralAviso;
  recordatorio: boolean;
}) {
  const [umbral, setUmbral] = useState(initialUmbral);
  const [recordatorio, setRecordatorio] = useState(initialRecordatorio);

  async function changeUmbral(value: UmbralAviso) {
    setUmbral(value);
    const res = await setUmbralAvisoAction(value);
    if (!res.success) setUmbral(umbral);
  }
  async function toggleRecordatorio() {
    const next = !recordatorio;
    setRecordatorio(next);
    const res = await setRecordatorioSemanalAction(next);
    if (!res.success) setRecordatorio(!next);
  }

  return (
    <div className="card">
      <div className="section-label">Historial y almacenamiento</div>
      <div className="hint" style={{ margin: "-6px 0 14px" }}>
        El historial nunca se borra solo. Elegí a partir de cuántos informes sin archivar querés que te avisemos.
      </div>
      <div className="radio-group">
        <label className="radio-opt">
          <input type="radio" name="retention" checked={umbral === "20"} onChange={() => changeUmbral("20")} />
          <span>
            <b>Avisar a los 20 informes</b>
            <span>o 4 semanas sin archivar, lo que ocurra primero</span>
          </span>
        </label>
        <label className="radio-opt">
          <input type="radio" name="retention" checked={umbral === "50"} onChange={() => changeUmbral("50")} />
          <span>
            <b>Avisar a los 50 informes</b>
            <span>o 8 semanas sin archivar</span>
          </span>
        </label>
        <label className="radio-opt">
          <input type="radio" name="retention" checked={umbral === "100"} onChange={() => changeUmbral("100")} />
          <span>
            <b>Avisar a los 100 informes</b>
            <span>o 12 semanas sin archivar</span>
          </span>
        </label>
      </div>
      <div className="switch-row" style={{ paddingTop: 18 }}>
        <div className="txt">
          <b>Recordatorio semanal de archivo</b>
          <span>Un aviso los viernes para descargar y archivar los informes de la semana</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={recordatorio} onChange={toggleRecordatorio} />
          <span className="slider"></span>
        </label>
      </div>
    </div>
  );
}
