/**
 * Mapeo de datos REALES de la ruta (distancia/duración de un servicio de
 * ruteo, pronóstico de un servicio de clima, gente ya cargada en el mismo
 * formulario) a las opciones de punto fijo del Anexo IV — nunca una IA
 * "adivinando" un dato objetivo: para algo que pesa en una decisión de
 * seguridad, una suposición equivocada es peor que dejarlo en blanco (ver
 * CRITERIOS_Y_IDEAS.md). Los criterios que dependen de la PERSONA, no de la
 * ruta (conocimiento del viaje, horas trabajadas) o que no tienen una fuente
 * de datos confiable (tipo de ruta, comunicación/señal) quedan afuera a
 * propósito — siguen siendo manuales.
 */

const HORA_INICIO_DIURNO = 7;
const HORA_FIN_DIURNO = 20;

export function mapDistanciaAValor(km: number): number {
  if (km < 50) return 1;
  if (km < 150) return 2;
  if (km < 300) return 3;
  return 8;
}

/** Hora local (Argentina) de un Date, sin depender de en qué timezone corre el server. */
function horaArgentina(d: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", hour12: false });
  return Number(fmt.format(d));
}

function esHorarioDiurno(hora: number): boolean {
  return hora >= HORA_INICIO_DIURNO && hora < HORA_FIN_DIURNO;
}

/** Diurno (0) si todo el viaje cae en horario diurno, Nocturno (10) si todo cae de noche, Diurno y Nocturno (5) si cruza el límite. */
export function mapTiempoViajeAValor(salida: Date, llegadaEstimada: Date): number {
  const salidaDiurna = esHorarioDiurno(horaArgentina(salida));
  const llegadaDiurna = esHorarioDiurno(horaArgentina(llegadaEstimada));
  if (salidaDiurna && llegadaDiurna) return 0;
  if (!salidaDiurna && !llegadaDiurna) return 10;
  return 5;
}

/** 1 = conductor, nunca menos. Solo entre las dos opciones "1 vehículo..." — este formulario es de UN vehículo, no sabe de un convoy. */
export function mapPersonasPorVehiculoAValor(totalPersonasEnElVehiculo: number): number {
  return totalPersonasEnElVehiculo <= 1 ? 6 : 4;
}

/**
 * Códigos WMO de Open-Meteo (https://open-meteo.com/en/docs) agrupados en
 * las 4 opciones del criterio C. `vientoMaxKmh` sube a "Lluvia / Barro /
 * Viento" un día sin lluvia pero muy ventoso, que si no quedaría mal
 * clasificado como "Soleado / Nublado".
 */
export function mapClimaAValor(weathercode: number, vientoMaxKmh: number): number {
  if ([95, 96, 99, 45, 48].includes(weathercode)) return 4; // Tormentas / Niebla
  if ([71, 73, 75, 77, 85, 86].includes(weathercode)) return 5; // Nieve / Heladas
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weathercode)) return 2; // Lluvia / Barro / Viento
  if (vientoMaxKmh >= 50) return 2;
  return 1; // Soleado / Nublado
}
