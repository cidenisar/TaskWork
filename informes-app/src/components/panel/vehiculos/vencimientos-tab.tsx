"use client";

import { useMemo } from "react";
import { computeFleetAlerts, INTERVALO_SERVICE_KM } from "@/lib/config/fleet-alerts";
import type { VehiculoItem } from "./vehiculos-tab";
import type { ServiceItem } from "./service-tab";
import { Icon, StatusDot } from "@/components/icon";
import { SuccessNote } from "@/components/notes";

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
        <Icon name="ai" size={13} /> La IA revisa las fechas de documentación y el kilometraje desde el último
        service, y avisa antes de que algo venza.
      </div>
      <div className="hint" style={{ margin: "0 0 12px" }}>
        Intervalo de service de referencia: {INTERVALO_SERVICE_KM.toLocaleString("es-AR")} km (fijo por ahora, todos
        los vehículos).
      </div>
      {alertas.length === 0 ? (
        <SuccessNote>Todo al día — sin vencimientos ni service pendientes en la flota.</SuccessNote>
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
