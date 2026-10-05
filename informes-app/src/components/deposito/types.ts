import type { CondicionMaterial, MotivoEntregaDeposito, TipoEquipoBaja } from "@/lib/database.types";

/** Máximo de fotos por lectura con IA en "Nueva Entrega" — mismo criterio que Equipos Individuales (varios ángulos del mismo ítem). */
export const ENTREGA_FOTO_IA_MAX = 5;

export const MOTIVO_ENTREGA_OPCIONES: MotivoEntregaDeposito[] = [
  "sobrante_obra",
  "reemplazo_funcional",
  "retorno_mantenimiento",
  "otro",
];

export const MOTIVO_ENTREGA_LABEL: Record<MotivoEntregaDeposito, string> = {
  sobrante_obra: "Sobrante de obra (nunca se usó)",
  reemplazo_funcional: "Reemplazo funcional (funciona, ya no se usa ahí)",
  retorno_mantenimiento: "Retorno post-mantenimiento/reparación",
  otro: "Otro",
};

export const CONDICION_OPCIONES: CondicionMaterial[] = ["nuevo", "usado_funcional"];

export const CONDICION_LABEL: Record<CondicionMaterial, string> = {
  nuevo: "Nuevo (sin usar)",
  usado_funcional: "Usado — funciona",
};

// Mismas 3 categorías que usa Bajas (tablero_circuitos/rack_equipamientos/equipos) — reusado a propósito.
export const TIPO_EQUIPO_LABEL: Record<TipoEquipoBaja, string> = {
  tablero_circuito: "Tablero — circuito/elemento",
  rack_equipamiento: "Rack — equipamiento",
  equipo_individual: "Equipo individual",
};
