import type { MotivoBaja, TipoEquipoBaja } from "@/lib/database.types";

export const MOTIVO_BAJA_OPCIONES: MotivoBaja[] = ["rotura", "ampliacion", "obsolescencia", "otro"];

export const MOTIVO_BAJA_LABEL: Record<MotivoBaja, string> = {
  rotura: "Rotura",
  ampliacion: "Ampliación / reemplazo",
  obsolescencia: "Obsolescencia",
  otro: "Otro",
};

export const TIPO_EQUIPO_BAJA_LABEL: Record<TipoEquipoBaja, string> = {
  tablero_circuito: "Tablero — circuito/elemento",
  rack_equipamiento: "Rack — equipamiento",
  equipo_individual: "Equipo individual",
};
