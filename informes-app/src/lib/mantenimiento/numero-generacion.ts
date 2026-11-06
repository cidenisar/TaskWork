/**
 * N° de generación para los 3 "logs de trabajo realizado" que antes no
 * tenían (mantenimiento de Tablero, Service de Vehículos, Plan de
 * Mantenimiento genérico de Racks/Equipos/Salas) — mismo criterio que el
 * resto de la app (prefijo + año + 4 dígitos random, con reintento ante
 * colisión a cargo de quien llama).
 */
export function nuevoNumeroGeneracionMantenimientoTablero(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `MANT-TAB-${year}-${n}`;
}

export function nuevoNumeroGeneracionServiceVehiculo(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `SERV-VEH-${year}-${n}`;
}

export function nuevoNumeroGeneracionMantenimientoEquipamiento(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(1000 + Math.random() * 9000);
  return `MANT-EQ-${year}-${n}`;
}
