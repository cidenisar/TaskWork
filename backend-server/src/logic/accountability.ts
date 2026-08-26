// Agregación del resumen de Accountability en vivo — pura, sin I/O.
//
// IMPORTANTE (ver 03-backend-online.md, "Escala esperada"): con 2000-4000
// personas por turno, esto NO se puede recalcular contando filas cada vez
// que alguien mira el dashboard. Esta función es la referencia de qué
// número es "correcto" — se usa para los tests, y para validar que los
// contadores incrementales que mantenga la base en producción (a definir en
// el próximo paso: probablemente un trigger o una tabla de contadores que se
// actualiza en cada INSERT/UPDATE de `confirmaciones`) coincidan con este
// resultado. No se recomienda llamarla contra la tabla completa en cada
// consulta real del dashboard.

import type { Confirmacion, PuntoEncuentro } from "../types.js";
import type { PayloadAccountabilityMqtt } from "../types.js";

export function calcularAccountability(
  eventoId: string,
  confirmaciones: Confirmacion[],
  puntos: PuntoEncuentro[]
): PayloadAccountabilityMqtt {
  const deEsteEvento = confirmaciones.filter((c) => c.evento_id === eventoId);

  const contarPor = (lista: Confirmacion[]) => ({
    ok: lista.filter((c) => c.estado === "ok").length,
    ayuda: lista.filter((c) => c.estado === "ayuda").length,
    pendiente: lista.filter((c) => c.estado === "pendiente").length,
  });

  const totales = contarPor(deEsteEvento);

  const porPunto = puntos.map((p) => {
    const deEstePunto = deEsteEvento.filter((c) => c.punto_id === p.id);
    return { puntoId: p.id, nombre: p.nombre, ...contarPor(deEstePunto) };
  });

  return {
    eventoId,
    notificados: deEsteEvento.length,
    ok: totales.ok,
    ayuda: totales.ayuda,
    pendiente: totales.pendiente,
    porPunto,
  };
}

/**
 * Prioriza los pedidos de ayuda para el operador — más nuevos primero, ya
 * que con 20-40 simultáneos (ver "Escala esperada") lo más urgente es ver
 * qué llegó recién, no una lista sin orden. `confirmadoAt` en ISO string;
 * las que todavía no tienen hora de confirmación van al final.
 */
export function ordenarPedidosDeAyuda<T extends { confirmadoAt: string | null }>(pedidos: T[]): T[] {
  return [...pedidos].sort((a, b) => {
    if (!a.confirmadoAt && !b.confirmadoAt) return 0;
    if (!a.confirmadoAt) return 1;
    if (!b.confirmadoAt) return -1;
    return new Date(b.confirmadoAt).getTime() - new Date(a.confirmadoAt).getTime();
  });
}
