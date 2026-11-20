/**
 * La hora de negocio siempre la pone el servidor (HANDOFF §12.1) — nunca el
 * reloj del dispositivo que hace el pedido. `motor.ts`/`cronograma.ts`
 * esperan la hora LOCAL de la guardia como "AAAA-MM-DDTHH:mm" (ver el
 * comentario de cada uno) — esta función hace esa conversión desde el
 * reloj real del servidor (que puede correr en cualquier zona).
 *
 * Zona horaria: parámetro pendiente de confirmar con Ivan (HANDOFF §16.6,
 * "¿solo Argentina?") — por ahora el default que el mismo documento
 * recomienda, America/Argentina/Buenos_Aires, igual criterio que
 * `src/lib/riesgo-viaje/autocompletar.ts`.
 */
const ZONA_GUARDIA = "America/Argentina/Buenos_Aires";

const FORMATO = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_GUARDIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23", // nunca "24:00" a medianoche (gotcha conocido de hour12:false en algunos motores JS)
});

export function horaGuardiaIso(d: Date = new Date()): string {
  const partes = Object.fromEntries(FORMATO.formatToParts(d).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}
