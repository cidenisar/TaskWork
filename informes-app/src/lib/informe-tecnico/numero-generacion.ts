export function nuevoNumeroGeneracionInforme(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `INF-${year}-${n}`;
}
