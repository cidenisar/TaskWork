/** Mismo criterio que el resto de la app: prefijo + año + 4 dígitos random, con reintento ante colisión a cargo de quien llama. */
export function nuevoNumeroGeneracionRiesgoViaje(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `RIESGO-${year}-${n}`;
}
