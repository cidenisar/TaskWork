"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeFleetAlerts, INTERVALO_SERVICE_KM } from "@/lib/config/fleet-alerts";
import { guardarFrecuenciaControlVehiculosAction } from "@/app/(app)/configuracion/actions/vehiculos";
import type { VehiculoItem } from "./vehiculos-tab";
import type { ServiceItem } from "./service-tab";
import { Icon, StatusDot } from "@/components/icon";
import { SuccessNote } from "@/components/notes";

export function VencimientosTab({
  vehiculos,
  services,
  frecuenciaControlDias,
  esAdmin,
}: {
  vehiculos: VehiculoItem[];
  services: ServiceItem[];
  frecuenciaControlDias: number;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [editandoFrecuencia, setEditandoFrecuencia] = useState(false);
  const [frecuenciaInput, setFrecuenciaInput] = useState(String(frecuenciaControlDias));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alertas = useMemo(
    () =>
      computeFleetAlerts(
        vehiculos.map((v) => ({
          id: v.id,
          patente: v.patente,
          vencimientoTarjetaVerde: v.vencimientoTarjetaVerde,
          vencimientoRto: v.vencimientoRto,
          kilometrajeActual: v.kilometrajeActual,
        })),
        services.map((s) => ({
          vehiculoId: s.vehiculoId,
          fecha: s.fecha,
          kilometraje: s.kilometraje,
          inconsistenciasDetectadas: s.inconsistenciasDetectadas,
        })),
        frecuenciaControlDias,
      ),
    [vehiculos, services, frecuenciaControlDias],
  );

  async function guardarFrecuencia() {
    setBusy(true);
    setError(null);
    const res = await guardarFrecuenciaControlVehiculosAction(frecuenciaInput);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    setEditandoFrecuencia(false);
    router.refresh();
  }

  return (
    <div>
      <div className="hint" style={{ margin: "-4px 0 8px" }}>
        <Icon name="ai" size={13} /> La IA revisa las fechas de documentación, el kilometraje desde el último service, el control
        periódico por tiempo, y compara el estado de cada control contra el anterior — avisa antes de que algo venza o si detecta algo
        distinto.
      </div>
      <div className="hint" style={{ margin: "0 0 4px" }}>
        Intervalo de service de referencia: {INTERVALO_SERVICE_KM.toLocaleString("es-AR")} km (fijo por ahora, todos los vehículos).
      </div>
      <div className="hint" style={{ margin: "0 0 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {editandoFrecuencia ? (
          <>
            <span>Control periódico cada</span>
            <input
              type="text"
              inputMode="numeric"
              value={frecuenciaInput}
              onChange={(e) => setFrecuenciaInput(e.target.value)}
              disabled={busy}
              style={{ width: 60 }}
            />
            <span>días</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void guardarFrecuencia()} disabled={busy}>
              {busy ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setEditandoFrecuencia(false);
                setFrecuenciaInput(String(frecuenciaControlDias));
                setError(null);
              }}
              disabled={busy}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <span>
              Control periódico cada {frecuenciaControlDias} día{frecuenciaControlDias === 1 ? "" : "s"} (todos los vehículos).
            </span>
            {esAdmin && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditandoFrecuencia(true)}>
                <Icon name="edit" size={12} /> Cambiar
              </button>
            )}
          </>
        )}
      </div>
      {error && <div className="error-text" style={{ marginBottom: 8 }}>{error}</div>}
      {alertas.length === 0 ? (
        <SuccessNote>Todo al día — sin vencimientos, controles ni service pendientes en la flota.</SuccessNote>
      ) : (
        alertas.map((a) => (
          <div className="insight-item" key={a.id}>
            <StatusDot tone={a.urgencia === "danger" ? "danger" : "warn"} /> <b>{a.patente}:</b> {a.mensaje}
          </div>
        ))
      )}
    </div>
  );
}
