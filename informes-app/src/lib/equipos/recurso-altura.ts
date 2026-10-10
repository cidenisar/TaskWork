import type { TipoMontajeCamara, RecursoAlturaMantenimiento } from "@/lib/database.types";

export const TIPO_MONTAJE_OPCIONES: TipoMontajeCamara[] = ["torre", "columna", "poste", "pared", "techo", "otro"];

export const TIPO_MONTAJE_LABEL: Record<TipoMontajeCamara, string> = {
  torre: "Torre",
  columna: "Columna",
  poste: "Poste",
  pared: "Pared",
  techo: "Techo/azotea",
  otro: "Otro",
};

export const RECURSO_ALTURA_OPCIONES: RecursoAlturaMantenimiento[] = ["escalera", "andamio_manlift", "grupo_altura"];

export const RECURSO_ALTURA_LABEL: Record<RecursoAlturaMantenimiento, string> = {
  escalera: "Escalera",
  andamio_manlift: "Andamio / manlift",
  grupo_altura: "Grupo de altura",
};

export interface ConfigRecursoAltura {
  tipoMontaje: TipoMontajeCamara;
  recursoFijo: RecursoAlturaMantenimiento | null;
  umbralEscaleraM: number | null;
}

/**
 * Qué recurso hace falta para hacer el mantenimiento de una cámara/domo
 * según dónde está montada y a qué altura real — nunca inventado por IA,
 * sale de un catálogo admin-configurable (Configuración → Catálogos →
 * Recurso por altura). "recursoFijo" (ej. torre → grupo de altura) ignora
 * la altura: un trabajo en torre siempre necesita el equipo especializado,
 * no es una decisión de cuántos metros. Sin "recursoFijo", se decide por
 * "umbralEscaleraM": hasta esa altura inclusive, Escalera; por encima,
 * Andamio/Manlift. Devuelve null cuando falta el tipo de montaje, la
 * altura, o no hay regla configurada todavía para ese tipo de montaje.
 */
export function calcularRecursoAltura(
  tipoMontaje: TipoMontajeCamara | null,
  alturaM: number | null,
  config: ConfigRecursoAltura[],
): RecursoAlturaMantenimiento | null {
  if (!tipoMontaje) return null;
  const cfg = config.find((c) => c.tipoMontaje === tipoMontaje);
  if (!cfg) return null;
  if (cfg.recursoFijo) return cfg.recursoFijo;
  if (alturaM == null || cfg.umbralEscaleraM == null) return null;
  return alturaM <= cfg.umbralEscaleraM ? "escalera" : "andamio_manlift";
}
