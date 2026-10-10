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
};

export function puedeVerEstadisticas(rol: Rol): boolean {
  return rol === "admin" || rol === "supervisor";
}

export function puedeVerConfiguracion(rol: Rol): boolean {
  return rol === "admin";
}

/** Dar de baja un equipo es una decisión operativa (no algo que cualquier técnico resuelve solo) — mismo gate que Estadísticas. */
export function puedeGestionarBajas(rol: Rol): boolean {
  return rol === "admin" || rol === "supervisor";
}

/** Entregar material/equipo a depósito es la misma clase de decisión operativa que una Baja — mismo gate. */
export function puedeGestionarDeposito(rol: Rol): boolean {
  return rol === "admin" || rol === "supervisor";
}

/** El Panel de Supervisión (vista general de sitios/equipamiento/vencimientos) es la misma audiencia que Estadísticas. */
export function puedeVerPanel(rol: Rol): boolean {
  return rol === "admin" || rol === "supervisor";
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
