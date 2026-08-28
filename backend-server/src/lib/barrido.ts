// Patrón compartido de "barrido periódico por sitio" — lo usan
// sincronizarPadronDeTodosLosSitios (handlers/padron.ts) y
// sincronizarSimulacroDeTodosLosSitios (handlers/simulacro.ts): recorrer
// todos los sitios, sincronizar cada uno, y que un fallo en uno no frene a
// los demás. Antes estaba duplicado en los dos handlers (hallazgo de code
// review) — unificado acá.
//
// En paralelo (Promise.allSettled), no secuencial: cada sitio es
// independiente y ya está aislado por su propio try/catch implícito (el
// resultado "rejected" de allSettled hace ese papel) — con varios sitios,
// recorrerlos uno por uno multiplica la latencia del barrido por N sin
// necesidad (otro hallazgo de la misma revisión).
export async function barridoPorSitio(
  tag: string,
  sitiosIds: string[],
  sincronizar: (sitioId: string) => Promise<void>
): Promise<void> {
  const resultados = await Promise.allSettled(sitiosIds.map((sitioId) => sincronizar(sitioId)));
  resultados.forEach((resultado, i) => {
    if (resultado.status === "rejected") {
      console.error(`[${tag}] error sincronizando sitio ${sitiosIds[i]}:`, resultado.reason);
    }
  });
}
