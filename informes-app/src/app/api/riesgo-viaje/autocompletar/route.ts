import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { mapDistanciaAValor, mapTiempoViajeAValor, mapClimaAValor, mapPersonasPorVehiculoAValor, descripcionClima } from "@/lib/riesgo-viaje/autocompletar";
import { geocodificarDireccion, obtenerRutaReal, obtenerPronosticoDiario } from "@/lib/riesgo-viaje/ruta";

/**
 * Completa A (Distancia), B (Tiempo de Viaje), C (Clima) y G (Personas por
 * Vehículo) del Anexo IV con datos REALES de la ruta (geocoding + ruteo +
 * pronóstico, todos servicios públicos gratuitos, sin API key) — nunca con
 * una IA adivinando. D (Tipo de Ruta), E (Conocimiento del Viaje), F
 * (Comunicación) y H (Horas Trabajadas) quedan afuera a propósito: dependen
 * de la persona o no hay una fuente de datos confiable (ver
 * CRITERIOS_Y_IDEAS.md). Todo lo que devuelve es una SUGERENCIA — el
 * técnico la ve precargada en los mismos desplegables de siempre y puede
 * cambiarla antes de guardar. También devuelve la geometría de la ruta y
 * las coordenadas para poder mostrar el trayecto en un mapa en pantalla.
 */
export async function POST(req: NextRequest) {
  await requireProfile();

  const body = await req.json().catch(() => null);
  const origen = typeof body?.origen === "string" ? body.origen.trim() : "";
  const destino = typeof body?.destino === "string" ? body.destino.trim() : "";
  const fechaHora = typeof body?.fechaHora === "string" ? body.fechaHora : "";
  const totalPersonas = Number(body?.totalPersonas);

  if (!origen || !destino) return NextResponse.json({ error: "Faltan origen y destino." }, { status: 400 });
  const salida = fechaHora ? new Date(fechaHora) : null;

  const avisos: string[] = [];
  let criterioDistancia: number | null = null;
  let criterioTiempoViaje: number | null = null;
  let criterioClima: number | null = null;
  let climaDescripcion: string | null = null;
  let distanciaKm: number | null = null;
  let origenCoords: { lat: number; lon: number } | null = null;
  let destinoCoords: { lat: number; lon: number } | null = null;
  let geometria: [number, number][] = [];

  const [coordsOrigen, coordsDestino] = await Promise.all([geocodificarDireccion(origen), geocodificarDireccion(destino)]);
  if (!coordsOrigen || !coordsDestino) {
    avisos.push(`No se pudo ubicar ${!coordsOrigen ? `"${origen}"` : `"${destino}"`} en el mapa — completá Distancia y Tiempo de Viaje a mano.`);
  } else {
    origenCoords = coordsOrigen;
    destinoCoords = coordsDestino;
    const ruta = await obtenerRutaReal(coordsOrigen, coordsDestino);
    if (!ruta) {
      avisos.push("No se pudo calcular la ruta — completá Distancia y Tiempo de Viaje a mano.");
    } else {
      distanciaKm = ruta.distanciaKm;
      geometria = ruta.geometria;
      criterioDistancia = mapDistanciaAValor(ruta.distanciaKm);
      if (salida && !Number.isNaN(salida.getTime())) {
        const llegadaEstimada = new Date(salida.getTime() + ruta.duracionSeg * 1000);
        criterioTiempoViaje = mapTiempoViajeAValor(salida, llegadaEstimada);
      }
    }

    if (salida && !Number.isNaN(salida.getTime())) {
      const fechaISO = salida.toISOString().slice(0, 10);
      const clima = await obtenerPronosticoDiario(coordsDestino, fechaISO);
      if (clima) {
        criterioClima = mapClimaAValor(clima.weathercode, clima.vientoMaxKmh);
        climaDescripcion = descripcionClima(clima.weathercode, clima.vientoMaxKmh, clima.tempMaxC, clima.tempMinC);
      } else {
        avisos.push("Sin pronóstico disponible para esa fecha todavía — completá Condición Climática a mano más cerca del viaje.");
      }
    }
  }

  const criterioPersonasVehiculo = Number.isFinite(totalPersonas) && totalPersonas > 0 ? mapPersonasPorVehiculoAValor(totalPersonas) : null;

  return NextResponse.json({
    distanciaKm: distanciaKm != null ? Math.round(distanciaKm) : null,
    criterioDistancia,
    criterioTiempoViaje,
    criterioClima,
    climaDescripcion,
    criterioPersonasVehiculo,
    origenCoords,
    destinoCoords,
    geometria,
    avisos,
  });
}
