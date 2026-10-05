export function nuevoNumeroGeneracionTorreComunicacion(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `TOC-${year}-${n}`;
}
