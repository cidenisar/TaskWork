import type { MotivoBaja, TipoEquipoBaja } from "@/lib/database.types";

export const MOTIVO_BAJA_OPCIONES: MotivoBaja[] = ["rotura", "ampliacion", "obsolescencia", "reemplazo", "otro"];

export const MOTIVO_BAJA_LABEL: Record<MotivoBaja, string> = {
  rotura: "Rotura",
  ampliacion: "Ampliación",
  obsolescencia: "Obsolescencia",
  /** Motivo que también se asigna solo, sin que un Admin lo elija a mano, cuando el alta de un material nuevo marca que reemplaza a este equipo. */
  reemplazo: "Reemplazo",
  otro: "Otro",
};

export const TIPO_EQUIPO_BAJA_LABEL: Record<TipoEquipoBaja, string> = {
  tablero_circuito: "Tablero — circuito/elemento",
  rack_equipamiento: "Rack — equipamiento",
  equipo_individual: "Equipo individual",
};
