import type { createClient } from "@/lib/supabase/server";
import { INTERVALO_SERVICE_KM } from "@/lib/config/fleet-alerts";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PanelVehiculoUltimoService {
  fecha: string;
  kilometraje: number;
}

export interface PanelVehiculoProximoService {
  /** null = no se puede calcular todavía (falta el kilometraje actual). */
  estado: "ok" | "warn" | "danger" | null;
  mensaje: string;
}

export interface PanelVehiculo {
  id: string;
  patente: string;
  marcaModelo: string | null;
  kilometrajeActual: number | null;
  vencimientoTarjetaVerde: string | null;
  vencimientoRto: string | null;
  ultimoService: PanelVehiculoUltimoService | null;
  proximoService: PanelVehiculoProximoService;
}

/**
 * Mismo criterio que "Vencimientos 🤖" de Configuración
 * (`lib/config/fleet-alerts.ts`): el intervalo de service es fijo (10.000
 * km para todos, por ahora) y se recalcula al vuelo a partir del último
 * service cargado — nunca se guarda un "próximo service" aparte.
 */
function calcularProximoService(
  kilometrajeActual: number | null,
  ultimoService: PanelVehiculoUltimoService | null,
): PanelVehiculoProximoService {
  if (kilometrajeActual == null) return { estado: null, mensaje: "Sin kilometraje cargado" };
  if (!ultimoService) return { estado: "warn", mensaje: "Nunca tuvo un service registrado" };

  const diff = kilometrajeActual - ultimoService.kilometraje;
  const restante = INTERVALO_SERVICE_KM - diff;
  if (diff >= INTERVALO_SERVICE_KM) {
    return { estado: "danger", mensaje: `Superó el intervalo de service (${diff.toLocaleString("es-AR")} km desde el último)` };
  }
  if (diff >= INTERVALO_SERVICE_KM - 1_000) {
    return { estado: "warn", mensaje: `A ${restante.toLocaleString("es-AR")} km del próximo service` };
  }
  return { estado: "ok", mensaje: `Faltan ${restante.toLocaleString("es-AR")} km para el próximo service` };
}

export async function getPanelVehiculos(supabase: Supabase): Promise<PanelVehiculo[]> {
  const [vehiculosRes, servicesRes] = await Promise.all([
    supabase
      .from("catalogo_vehiculos")
      .select("id, patente, marca_modelo, kilometraje_actual, vencimiento_tarjeta_verde, vencimiento_rto")
      .order("patente"),
    supabase.from("vehiculo_services").select("vehiculo_id, fecha, kilometraje").order("fecha", { ascending: false }),
  ]);

  // Ordenados por fecha descendente — la primera fila que aparece para cada
  // vehículo ya es la más reciente.
  const ultimoServicePorVehiculo = new Map<string, PanelVehiculoUltimoService>();
  for (const s of servicesRes.data ?? []) {
    if (!ultimoServicePorVehiculo.has(s.vehiculo_id)) {
      ultimoServicePorVehiculo.set(s.vehiculo_id, { fecha: s.fecha, kilometraje: s.kilometraje });
    }
  }

  return (vehiculosRes.data ?? []).map((v) => {
    const ultimoService = ultimoServicePorVehiculo.get(v.id) ?? null;
    return {
      id: v.id,
      patente: v.patente,
      marcaModelo: v.marca_modelo,
      kilometrajeActual: v.kilometraje_actual,
      vencimientoTarjetaVerde: v.vencimiento_tarjeta_verde,
      vencimientoRto: v.vencimiento_rto,
      ultimoService,
      proximoService: calcularProximoService(v.kilometraje_actual, ultimoService),
    };
  });
}
