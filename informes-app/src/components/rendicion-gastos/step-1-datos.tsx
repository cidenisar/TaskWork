"use client";

import type { CatalogosRendicion, RendicionFormState } from "./types";
import { UbicacionFields } from "@/components/ubicaciones/ubicacion-fields";

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
      <div className="section-label" style={{ marginTop: 4 }}>
        Ubicación <span className="opt">(opcional)</span>
      </div>
      <UbicacionFields
        ubicaciones={catalogos.ubicaciones}
        provincias={catalogos.provincias}
        provinciaFiltro={form.provinciaFiltro}
        onProvinciaFiltroChange={(p) =>
          onChange({ provinciaFiltro: p, ubicacionId: "", localidadNueva: "", sitioNueva: "", plantaNueva: "", oficinaNueva: "" })
        }
        ubicacionId={form.ubicacionId}
        onUbicacionIdChange={(id) =>
          onChange(
            id === "__new"
              ? { ubicacionId: id }
              : { ubicacionId: id, localidadNueva: "", sitioNueva: "", plantaNueva: "", oficinaNueva: "" },
          )
        }
        localidadNueva={form.localidadNueva}
        onLocalidadNuevaChange={(v) => onChange({ localidadNueva: v })}
        sitioNueva={form.sitioNueva}
        onSitioNuevaChange={(v) => onChange({ sitioNueva: v })}
        plantaNueva={form.plantaNueva}
        onPlantaNuevaChange={(v) => onChange({ plantaNueva: v })}
        oficinaNueva={form.oficinaNueva}
        onOficinaNuevaChange={(v) => onChange({ oficinaNueva: v })}
        onGpsCapturado={(gps) => onChange({ gps })}
        requerido={false}
      />
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
