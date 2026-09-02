"use client";

import type { CatalogosRendicion, RendicionFormState } from "./types";

export function Step1Datos({
  form,
  onChange,
  catalogos,
}: {
  form: RendicionFormState;
  onChange: (patch: Partial<RendicionFormState>) => void;
  catalogos: CatalogosRendicion;
}) {
  return (
    <div className="card">
      <div className="grid2">
        <div className="field">
          <label>
            Motivo / Título <span className="req">*</span>
          </label>
          <input
            type="text"
            placeholder="Ej: Viaje a obra YPF Luján de Cuyo"
            value={form.motivo}
            onChange={(e) => onChange({ motivo: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>
            Fecha <span className="req">*</span>
          </label>
          <input type="date" value={form.fecha} onChange={(e) => onChange({ fecha: e.target.value })} required />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>
            Proyecto / Cliente <span className="opt">(opcional)</span>
          </label>
          <input
            type="text"
            placeholder="Ej: YPF — Ed. Comunicaciones"
            value={form.proyectoCliente}
            onChange={(e) => onChange({ proyectoCliente: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Provincia</label>
          <select value={form.provincia} onChange={(e) => onChange({ provincia: e.target.value })}>
            <option value="">Seleccionar provincia...</option>
            {catalogos.provincias.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>
            Viático Recibido <span className="req">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={form.viaticoRecibido}
            onChange={(e) => onChange({ viaticoRecibido: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Moneda</label>
          <select value={form.moneda} onChange={(e) => onChange({ moneda: e.target.value as "ARS" | "USD" })}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      <div className="hint">
        Los técnicos no se cargan acá — se agregan por cada gasto en el paso siguiente, porque un mismo viaje puede
        tener gastos de distintas personas.
      </div>
    </div>
  );
}
