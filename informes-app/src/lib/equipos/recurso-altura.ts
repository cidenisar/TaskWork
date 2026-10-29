import type { TipoMontajeCamara } from "@/lib/database.types";

export const TIPO_MONTAJE_OPCIONES: TipoMontajeCamara[] = ["torre", "columna", "poste", "pared", "techo", "otro"];

export const TIPO_MONTAJE_LABEL: Record<TipoMontajeCamara, string> = {
  torre: "Torre",
  columna: "Columna",
  poste: "Poste",
  pared: "Pared",
  techo: "Techo/azotea",
  otro: "Otro",
};

export interface BandaRecursoAltura {
  alturaHastaM: number;
  recurso: string;
}

export interface ConfigRecursoAltura {
  tipoMontaje: TipoMontajeCamara;
  /** Ignora la altura — ej. Torre siempre necesita el mismo recurso, no es una decisión de cuántos metros. */
  recursoFijo: string | null;
  /** Bandas ascendentes "hasta tantos metros, tal recurso" — mismo criterio que catalogo_calibre_cable. */
  bandas: BandaRecursoAltura[];
}

/**
 * Qué recurso hace falta para hacer el mantenimiento de una cámara/domo
 * según dónde está montada y a qué altura real — nunca inventado por IA,
 * sale de un catálogo admin-configurable (Configuración → Catálogos →
 * Recurso por altura), con el nombre del recurso en sí también abierto
 * (catalogo_tipos_recurso_altura — un Admin puede sumar uno nuevo, ej.
 * "Andamóvil", sin tocar código). "recursoFijo" ignora la altura; sin él,
 * se busca la banda más chica cuyo alturaHastaM alcance a cubrir la altura
 * real. Devuelve null cuando falta el tipo de montaje, la altura, o no hay
 * ninguna banda configurada que llegue tan alto (nunca se inventa un
 * recurso para una altura sin regla).
 */
export function calcularRecursoAltura(
  tipoMontaje: TipoMontajeCamara | null,
  alturaM: number | null,
  config: ConfigRecursoAltura[],
): string | null {
  if (!tipoMontaje) return null;
  const cfg = config.find((c) => c.tipoMontaje === tipoMontaje);
  if (!cfg) return null;
  if (cfg.recursoFijo) return cfg.recursoFijo;
  if (alturaM == null) return null;
  const ordenadas = [...cfg.bandas].sort((a, b) => a.alturaHastaM - b.alturaHastaM);
  const banda = ordenadas.find((b) => b.alturaHastaM >= alturaM);
  return banda ? banda.recurso : null;
}

/** Arma la config completa (por tipo de montaje) a partir de las dos tablas crudas — mismo shape que necesitan todos los que leen catalogo_recurso_altura/_bandas. */
export function construirConfigRecursoAltura(
  fijos: { tipo_montaje: TipoMontajeCamara; recurso_fijo: string | null }[],
  bandas: { tipo_montaje: TipoMontajeCamara; altura_hasta_m: number; recurso: string }[],
): ConfigRecursoAltura[] {
  return TIPO_MONTAJE_OPCIONES.map((tipoMontaje) => ({
    tipoMontaje,
    recursoFijo: fijos.find((f) => f.tipo_montaje === tipoMontaje)?.recurso_fijo ?? null,
    bandas: bandas
      .filter((b) => b.tipo_montaje === tipoMontaje)
      .map((b) => ({ alturaHastaM: Number(b.altura_hasta_m), recurso: b.recurso })),
  }));
}
