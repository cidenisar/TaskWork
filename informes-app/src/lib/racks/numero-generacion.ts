export function nuevoNumeroGeneracionRack(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `REL-${year}-${n}`;
}
