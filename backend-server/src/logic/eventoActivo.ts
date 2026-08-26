// A qué consolas les llega el aviso de `consolas/{id}/evento-activo` — pura.
//
// Ver 03-backend-online.md, "Sitios vecinos": el aviso es informativo, llega
// a las consolas del propio sitio Y a las de cualquier sitio marcado como
// vecino — nunca dispara ni cierra nada, y nunca cambia a quién le llega la
// alerta formal (push/SMS), que sigue siendo solo la gente del sitio del
// evento.

export interface ConsolaDestino {
  consolaId: string;
  sitioId: string;
  relacion: "mismo-sitio" | "sitio-vecino";
}

/**
 * @param sitioEventoId sitio donde ocurrió el evento
 * @param sitiosVecinosIds ids de los sitios marcados como vecinos de ese sitio
 * @param consolasPorSitio mapa sitioId -> ids de consolas activas en ese sitio
 */
export function resolverConsolasParaEventoActivo(
  sitioEventoId: string,
  sitiosVecinosIds: string[],
  consolasPorSitio: Map<string, string[]>
): ConsolaDestino[] {
  const destinos: ConsolaDestino[] = [];

  for (const consolaId of consolasPorSitio.get(sitioEventoId) ?? []) {
    destinos.push({ consolaId, sitioId: sitioEventoId, relacion: "mismo-sitio" });
  }

  for (const vecinoId of sitiosVecinosIds) {
    for (const consolaId of consolasPorSitio.get(vecinoId) ?? []) {
      destinos.push({ consolaId, sitioId: vecinoId, relacion: "sitio-vecino" });
    }
  }

  return destinos;
}
