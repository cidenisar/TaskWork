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
  vencimientoMatafuego: string | null;
  vencimientoBotiquin: string | null;
  kilometrajeActual: number | null;
}

export interface ServiceParaAlerta {
  vehiculoId: string;
  fecha: string;
  kilometraje: number;
  inconsistenciasDetectadas?: string | null;
}

const VENTANA_PROXIMO_CONTROL_DIAS = 7;

/**
 * Control periódico por TIEMPO (ej. "cada 30 días") — distinto del
 * intervalo por kilometraje de arriba, que ya existía. Se calcula sobre la
 * fecha del último service registrado (cualquiera cuenta como "control",
 * tenga fotos o no) + la frecuencia configurada por un Admin
 * (`config_general.vehiculo_control_frecuencia_dias`).
 */
export function estadoControlPeriodico(
  frecuenciaDias: number,
  ultimoControlFecha: string | null,
  hoy: Date = new Date(),
): { urgencia: "warn" | "danger"; mensaje: string } | null {
  if (!ultimoControlFecha) return { urgencia: "warn", mensaje: "Nunca tuvo un control registrado" };
  hoy.setHours(0, 0, 0, 0);
  const diasDesde = Math.round((hoy.getTime() - new Date(`${ultimoControlFecha}T00:00:00`).getTime()) / 86_400_000);
  const restantes = frecuenciaDias - diasDesde;
  if (restantes < 0) return { urgencia: "danger", mensaje: `Control vencido hace ${Math.abs(restantes)} día${Math.abs(restantes) === 1 ? "" : "s"}` };
  if (restantes <= VENTANA_PROXIMO_CONTROL_DIAS) return { urgencia: "warn", mensaje: `Próximo control en ${restantes} día${restantes === 1 ? "" : "s"}` };
  return null;
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

export function computeFleetAlerts(
  vehiculos: VehiculoParaAlerta[],
  services: ServiceParaAlerta[],
  frecuenciaControlDias: number | null = null,
): AlertaFlota[] {
  const ultimoServicePorVehiculo = new Map<string, ServiceParaAlerta>();
  for (const s of services) {
    const actual = ultimoServicePorVehiculo.get(s.vehiculoId);
    if (!actual || s.fecha > actual.fecha) ultimoServicePorVehiculo.set(s.vehiculoId, s);
  }

  const alertas: AlertaFlota[] = [];

  for (const v of vehiculos) {
    if (frecuenciaControlDias != null) {
      const ultimo = ultimoServicePorVehiculo.get(v.id);
      const estado = estadoControlPeriodico(frecuenciaControlDias, ultimo?.fecha ?? null);
      if (estado) alertas.push({ id: `${v.id}-control`, patente: v.patente, urgencia: estado.urgencia, mensaje: estado.mensaje });
    }

    const ultimoConInconsistencia = ultimoServicePorVehiculo.get(v.id);
    if (ultimoConInconsistencia?.inconsistenciasDetectadas) {
      alertas.push({
        id: `${v.id}-inconsistencia`,
        patente: v.patente,
        urgencia: "danger",
        mensaje: `La IA detectó algo distinto respecto del control anterior: ${ultimoConInconsistencia.inconsistenciasDetectadas}`,
      });
    }
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

    const matafuegoEstado = estadoVencimiento(v.vencimientoMatafuego);
    if (matafuegoEstado === "warn" || matafuegoEstado === "danger") {
      alertas.push({
        id: `${v.id}-matafuego`,
        patente: v.patente,
        urgencia: matafuegoEstado,
        mensaje: `Matafuego ${matafuegoEstado === "danger" ? "vencido" : "próximo a vencer"} (${v.vencimientoMatafuego})`,
      });
    }

    const botiquinEstado = estadoVencimiento(v.vencimientoBotiquin);
    if (botiquinEstado === "warn" || botiquinEstado === "danger") {
      alertas.push({
        id: `${v.id}-botiquin`,
        patente: v.patente,
        urgencia: botiquinEstado,
        mensaje: `Botiquín ${botiquinEstado === "danger" ? "vencido" : "próximo a vencer"} (${v.vencimientoBotiquin})`,
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
