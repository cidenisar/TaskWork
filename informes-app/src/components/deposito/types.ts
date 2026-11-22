import type { CondicionMaterial, MotivoEntregaDeposito, TipoEquipoBaja } from "@/lib/database.types";

/**
 * Máximo de fotos por carga con IA en "Nueva Entrega" — una entrega puede
 * ahora tener VARIOS materiales distintos (no solo varios ángulos de uno),
 * así que el máximo es más alto que un ítem único: cada foto puede ser un
 * material diferente, o un ángulo más de uno ya detectado (la IA no lo
 * duplica). Mismo criterio que Equipos Individuales, con más margen.
 */
export const ENTREGA_FOTO_IA_MAX = 10;

/**
 * Fotos de evidencia (vista general del material, no para identificar con
 * IA) que quedan guardadas junto con la entrega y se imprimen en el PDF del
 * comprobante — distintas de las fotos de arriba, que se procesan y se
 * descartan. Tope bajo a propósito: es una foto de contexto, no un
 * relevamiento fotográfico exhaustivo.
 */
export const ENTREGA_FOTOS_EVIDENCIA_MAX = 2;

export interface MaterialEntregaItem {
  descripcion: string;
  categoria: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  condicion: CondicionMaterial;
  motivo: MotivoEntregaDeposito;
  comentario: string;
  revisar: boolean;
}

export const MATERIAL_NUEVO_BASE: Omit<MaterialEntregaItem, "descripcion" | "revisar"> = {
  categoria: "",
  marcaModelo: "",
  numeroSerie: "",
  etiquetaYpf: "",
  cantidad: 1,
  condicion: "usado_funcional",
  motivo: "sobrante_obra",
  comentario: "",
};

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
