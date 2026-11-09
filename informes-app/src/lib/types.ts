import type { Rol } from "@/lib/database.types";

export type { Rol };

export interface Profile {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: Rol;
  telefono: string | null;
  fotoPerfilUrl: string | null;
  activo: boolean;
}

export const ROL_LABEL: Record<Rol, string> = {
  tecnico: "TÉCNICO",
  supervisor: "SUPERVISOR",
  admin: "ADMINISTRADOR",
  superusuario: "SUPERUSUARIO",
};

/** Superusuario está por ENCIMA de Admin, no al costado — tiene todo lo que ya tiene Admin, nunca menos. */
export function puedeVerEstadisticas(rol: Rol): boolean {
  return rol === "admin" || rol === "supervisor" || rol === "superusuario";
}

export function puedeVerConfiguracion(rol: Rol): boolean {
  return rol === "admin" || rol === "superusuario";
}

/** Dar de baja un equipo es una decisión operativa (no algo que cualquier técnico resuelve solo) — mismo gate que Estadísticas. */
export function puedeGestionarBajas(rol: Rol): boolean {
  return rol === "admin" || rol === "supervisor" || rol === "superusuario";
}

/** Entregar material/equipo a depósito es la misma clase de decisión operativa que una Baja — mismo gate. */
export function puedeGestionarDeposito(rol: Rol): boolean {
  return rol === "admin" || rol === "supervisor" || rol === "superusuario";
}

/**
 * El Panel de Supervisión también lo puede abrir un técnico, pero limitado:
 * ve Vista general, Mantenimientos, Vehículos, Planos y QR, Buscar Material y
 * Riesgo de Viaje — nunca Estadísticas ni Configuración (ver PanelNav y el
 * gate de cada una, que siguen siendo Admin/Supervisor-only aparte de esto).
 */
export function puedeVerPanel(rol: Rol): boolean {
  return rol === "tecnico" || rol === "admin" || rol === "supervisor" || rol === "superusuario";
}

/**
 * Las acciones más irreversibles de toda la app — los 9 "Eliminar" de
 * Historial, "Vaciar datos de prueba" y el borrado real de un usuario —
 * dejan de ser de Admin y pasan a ser EXCLUSIVAS de Superusuario (no
 * "Admin o Superusuario": a propósito, un Admin ya no puede hacer esto).
 */
export function puedeBorrarDefinitivo(rol: Rol): boolean {
  return rol === "superusuario";
}

export interface Tecnico {
  nombre: string;
  torre: string;
  esSeguridad: boolean;
}

export interface Vehiculo {
  patente: string;
  marcaModelo: string;
}

export interface ImagenInforme {
  /** Id temporal en el wizard (no persiste). */
  clientId: string;
  dataUrl: string;
  blob: Blob;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  tomadaEn: string;
  tieneGeo: boolean;
}
