/**
 * Pronóstico de lluvia por sitio, para decidir si conviene programar una
 * visita de mantenimiento — usa Open-Meteo (gratuita, sin API key) con la
 * latitud/longitud que el sitio ya tiene guardada (capturada por GPS al
 * cargar la Ubicación). A propósito NO se le pide esto a un modelo de IA:
 * una IA sin acceso a internet en este flujo terminaría inventando el
 * clima, y pedirle que "interprete" un pronóstico estructurado es más
 * lento/caro y menos confiable que una regla simple sobre los números
 * reales (probabilidad de precipitación) que ya trae la API.
 */

export interface PronosticoSitio {
  /** true si algún día de la ventana supera el umbral de probabilidad de lluvia. */
  lluviaProxima: boolean;
  probabilidadMaxima: number;
}

const DIAS_PRONOSTICO = 3;
const UMBRAL_PROBABILIDAD_LLUVIA = 60;

interface OpenMeteoRespuesta {
  daily?: { precipitation_probability_max?: number[] };
}

/**
 * Un solo pedido para todos los sitios (Open-Meteo acepta listas de
 * lat/lng separadas por coma) — más barato que un pedido por sitio.
 * Si falla (sin internet, API caída, etc.) devuelve un Map vacío: el
 * resto de la pantalla sigue funcionando sin el dato de clima.
 */
export async function getPronosticosPorSitio(
  puntos: { ubicacionId: string; lat: number; lng: number }[],
): Promise<Map<string, PronosticoSitio>> {
  const resultado = new Map<string, PronosticoSitio>();
  if (puntos.length === 0) return resultado;

  const lat = puntos.map((p) => p.lat).join(",");
  const lng = puntos.map((p) => p.lng).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_probability_max&forecast_days=${DIAS_PRONOSTICO}&timezone=auto`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return resultado;
    const data: OpenMeteoRespuesta | OpenMeteoRespuesta[] = await res.json();
    const respuestas = Array.isArray(data) ? data : [data];
    respuestas.forEach((r, i) => {
      const punto = puntos[i];
      const probs = r.daily?.precipitation_probability_max ?? [];
      if (!punto || probs.length === 0) return;
      const probabilidadMaxima = Math.max(...probs);
      resultado.set(punto.ubicacionId, {
        lluviaProxima: probabilidadMaxima >= UMBRAL_PROBABILIDAD_LLUVIA,
        probabilidadMaxima,
      });
    });
  } catch {
    // best-effort: sin clima, la pantalla sigue andando igual
  }
  return resultado;
}
