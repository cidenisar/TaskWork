/**
 * "Vencimientos 🤖" (spec sección 9.4): alertas de documentación (Tarjeta
 * Verde / RTO) + kilometraje vs. último service, recalculadas en el momento
 * a partir de los datos actuales — sin guardar nada aparte.
 */

export const INTERVALO_SERVICE_KM = 10_000;

export type UrgenciaAlerta = "warn" | "danger";

export interface AlertaFlota {
  id: string;
  patente: string;
  urgencia: UrgenciaAlerta;
  mensaje: string;
}

export interface VehiculoParaAlerta {
  id: string;
  patente: string;
  vencimientoTarjetaVerde: string | null;
  vencimientoRto: string | null;
  kilometrajeActual: number | null;
}

export interface ServiceParaAlerta {
  vehiculoId: string;
  fecha: string;
  kilometraje: number;
}

/** null = sin fecha cargada (no genera alerta). */
export function estadoVencimiento(fecha: string | null): "ok" | "warn" | "danger" | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${fecha}T00:00:00`);
  const diffDias = Math.round((venc.getTime() - hoy.getTime()) / 86_400_000);
  if (diffDias < 0) return "danger";
  if (diffDias <= 30) return "warn";
  return "ok";
}

export function computeFleetAlerts(vehiculos: VehiculoParaAlerta[], services: ServiceParaAlerta[]): AlertaFlota[] {
  const ultimoServicePorVehiculo = new Map<string, ServiceParaAlerta>();
  for (const s of services) {
    const actual = ultimoServicePorVehiculo.get(s.vehiculoId);
    if (!actual || s.fecha > actual.fecha) ultimoServicePorVehiculo.set(s.vehiculoId, s);
  }

  const alertas: AlertaFlota[] = [];

  for (const v of vehiculos) {
    const tarjetaEstado = estadoVencimiento(v.vencimientoTarjetaVerde);
    if (tarjetaEstado === "warn" || tarjetaEstado === "danger") {
      alertas.push({
        id: `${v.id}-tarjeta`,
        patente: v.patente,
        urgencia: tarjetaEstado,
        mensaje: `Tarjeta Verde ${tarjetaEstado === "danger" ? "vencida" : "próxima a vencer"} (${v.vencimientoTarjetaVerde})`,
      });
    }

    const rtoEstado = estadoVencimiento(v.vencimientoRto);
    if (rtoEstado === "warn" || rtoEstado === "danger") {
      alertas.push({
        id: `${v.id}-rto`,
        patente: v.patente,
        urgencia: rtoEstado,
        mensaje: `RTO ${rtoEstado === "danger" ? "vencida" : "próxima a vencer"} (${v.vencimientoRto})`,
      });
    }

    if (v.kilometrajeActual != null) {
      const ultimo = ultimoServicePorVehiculo.get(v.id);
      if (!ultimo) {
        alertas.push({
          id: `${v.id}-sinservice`,
          patente: v.patente,
          urgencia: "warn",
          mensaje: "Tiene kilometraje cargado pero nunca tuvo un service registrado",
        });
      } else {
        const diff = v.kilometrajeActual - ultimo.kilometraje;
        if (diff >= INTERVALO_SERVICE_KM) {
          alertas.push({
            id: `${v.id}-km-danger`,
            patente: v.patente,
            urgencia: "danger",
            mensaje: `Superó el intervalo de service (${diff.toLocaleString("es-AR")} km desde el último)`,
          });
        } else if (diff >= INTERVALO_SERVICE_KM - 1000) {
          alertas.push({
            id: `${v.id}-km-warn`,
            patente: v.patente,
            urgencia: "warn",
            mensaje: `A ${(INTERVALO_SERVICE_KM - diff).toLocaleString("es-AR")} km del próximo service`,
          });
        }
      }
    }
  }

  return alertas.sort((a, b) => (a.urgencia === b.urgencia ? 0 : a.urgencia === "danger" ? -1 : 1));
}
