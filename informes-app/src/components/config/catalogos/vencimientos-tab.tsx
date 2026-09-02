"use client";

import { useMemo } from "react";
import { computeFleetAlerts, INTERVALO_SERVICE_KM } from "@/lib/config/fleet-alerts";
import type { VehiculoItem } from "./vehiculos-tab";
import type { ServiceItem } from "./service-tab";

export function VencimientosTab({ vehiculos, services }: { vehiculos: VehiculoItem[]; services: ServiceItem[] }) {
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
        services.map((s) => ({ vehiculoId: s.vehiculoId, fecha: s.fecha, kilometraje: s.kilometraje })),
      ),
    [vehiculos, services],
  );

  return (
    <div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        🤖 La IA revisa las fechas de documentación y el kilometraje desde el último service, y avisa antes de que
        algo venza.
      </div>
      <div className="hint" style={{ margin: "0 0 12px" }}>
        Intervalo de service de referencia: {INTERVALO_SERVICE_KM.toLocaleString("es-AR")} km (fijo por ahora, todos
        los vehículos).
      </div>
      {alertas.length === 0 ? (
        <div className="success-note">✅ Todo al día — sin vencimientos ni service pendientes en la flota.</div>
      ) : (
        alertas.map((a) => (
          <div className="insight-item" key={a.id}>
            {a.urgencia === "danger" ? "🔴" : "🟡"} <b>{a.patente}:</b> {a.mensaje}
          </div>
        ))
      )}
    </div>
  );
}
