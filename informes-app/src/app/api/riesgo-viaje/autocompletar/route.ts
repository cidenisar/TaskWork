import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { mapDistanciaAValor, mapTiempoViajeAValor, mapClimaAValor, mapPersonasPorVehiculoAValor } from "@/lib/riesgo-viaje/autocompletar";

/**
 * Completa A (Distancia), B (Tiempo de Viaje), C (Clima) y G (Personas por
 * Vehículo) del Anexo IV con datos REALES de la ruta (geocoding + ruteo +
 * pronóstico, todos servicios públicos gratuitos, sin API key) — nunca con
 * una IA adivinando. D (Tipo de Ruta), E (Conocimiento del Viaje), F
 * (Comunicación) y H (Horas Trabajadas) quedan afuera a propósito: dependen
 * de la persona o no hay una fuente de datos confiable (ver
 * CRITERIOS_Y_IDEAS.md). Todo lo que devuelve es una SUGERENCIA — el
 * técnico la ve precargada en los mismos desplegables de siempre y puede
 * cambiarla antes de guardar.
 */

const USER_AGENT = "TaskWorkApp/1.0 (uso interno)";

interface Coords {
  lat: number;
  lon: number;
}

async function geocodificar(direccion: string): Promise<Coords | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&q=${encodeURIComponent(direccion)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    const primero = Array.isArray(data) ? data[0] : null;
    if (!primero) return null;
    const lat = Number(primero.lat);
    const lon = Number(primero.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

async function obtenerRuta(origen: Coords, destino: Coords): Promise<{ distanciaKm: number; duracionSeg: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origen.lon},${origen.lat};${destino.lon},${destino.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const ruta = data?.routes?.[0];
    if (!ruta || typeof ruta.distance !== "number" || typeof ruta.duration !== "number") return null;
    return { distanciaKm: ruta.distance / 1000, duracionSeg: ruta.duration };
  } catch {
    return null;
  }
}

async function obtenerClima(coords: Coords, fecha: string): Promise<{ weathercode: number; vientoMaxKmh: number } | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=weathercode,windspeed_10m_max&timezone=America%2FArgentina%2FBuenos_Aires&start_date=${fecha}&end_date=${fecha}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const weathercode = data?.daily?.weathercode?.[0];
    const vientoMaxKmh = data?.daily?.windspeed_10m_max?.[0];
    if (typeof weathercode !== "number" || typeof vientoMaxKmh !== "number") return null;
    return { weathercode, vientoMaxKmh };
  } catch {
    return null;
  }
}

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
  let distanciaKm: number | null = null;

  const [coordsOrigen, coordsDestino] = await Promise.all([geocodificar(origen), geocodificar(destino)]);
  if (!coordsOrigen || !coordsDestino) {
    avisos.push(`No se pudo ubicar ${!coordsOrigen ? `"${origen}"` : `"${destino}"`} en el mapa — completá Distancia y Tiempo de Viaje a mano.`);
  } else {
    const ruta = await obtenerRuta(coordsOrigen, coordsDestino);
    if (!ruta) {
      avisos.push("No se pudo calcular la ruta — completá Distancia y Tiempo de Viaje a mano.");
    } else {
      distanciaKm = ruta.distanciaKm;
      criterioDistancia = mapDistanciaAValor(ruta.distanciaKm);
      if (salida && !Number.isNaN(salida.getTime())) {
        const llegadaEstimada = new Date(salida.getTime() + ruta.duracionSeg * 1000);
        criterioTiempoViaje = mapTiempoViajeAValor(salida, llegadaEstimada);
      }
    }

    if (salida && !Number.isNaN(salida.getTime())) {
      const fechaISO = salida.toISOString().slice(0, 10);
      const clima = await obtenerClima(coordsDestino, fechaISO);
      if (clima) {
        criterioClima = mapClimaAValor(clima.weathercode, clima.vientoMaxKmh);
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
    criterioPersonasVehiculo,
    avisos,
  });
}
