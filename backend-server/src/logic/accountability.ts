// Agregación del resumen de Accountability en vivo — pura, sin I/O.
//
// IMPORTANTE (ver 03-backend-online.md, "Escala esperada"): con 2000-4000
// personas por turno, esto NO se puede recalcular contando filas cada vez
// que alguien mira el dashboard. `calcularAccountability` (recount
// completo desde `confirmaciones`) queda como la referencia de qué número
// es "correcto" — se usa para los tests, y para validar por fuera que
// `armarAccountabilityDesdeContadores` (el camino real que usa el
// handler, ver más abajo) da lo mismo partiendo de
// `accountability_contadores` en vez de la tabla completa. Ver README
// "Contador incremental de Accountability" — decisión tomada
// (2026-08-27): trigger de Postgres (`trg_confirmaciones_accountability`)
// mantiene esa tabla de contadores en cada INSERT/UPDATE/DELETE de
// `confirmaciones`, y el handler la lee en vez de recontar.

import type { Confirmacion, ContadorAccountability, PuntoEncuentro } from "../types.js";
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
 * Camino real (ver `handlers/eventos.ts`, `publicarAccountabilityDeEvento`):
 * arma el mismo `PayloadAccountabilityMqtt` que `calcularAccountability`,
 * pero a partir de los contadores ya sumados en `accountability_contadores`
 * en vez de recorrer todas las confirmaciones del evento — el resultado
 * de sumar unas pocas filas (una por punto + una para "sin punto"), no de
 * filtrar potencialmente miles.
 */
export function armarAccountabilityDesdeContadores(
  eventoId: string,
  contadores: ContadorAccountability[],
  puntos: PuntoEncuentro[]
): PayloadAccountabilityMqtt {
  // El total del evento suma TODOS los contadores, incluido el bucket
  // `puntoId: null` (confirmaciones sin punto asignado) — mismo criterio
  // que `calcularAccountability`, donde `totales` sale de TODA
  // `deEsteEvento` sin filtrar por punto.
  const totales = contadores.reduce(
    (acc, c) => ({ ok: acc.ok + c.ok, ayuda: acc.ayuda + c.ayuda, pendiente: acc.pendiente + c.pendiente }),
    { ok: 0, ayuda: 0, pendiente: 0 }
  );
  const notificados = totales.ok + totales.ayuda + totales.pendiente;

  const porPunto = puntos.map((p) => {
    // Sin fila en accountability_contadores todavía = nadie de ese punto
    // se confirmó ni nació `pendiente` ahí — cuenta 0, no un error.
    const contador = contadores.find((c) => c.puntoId === p.id);
    return {
      puntoId: p.id,
      nombre: p.nombre,
      ok: contador?.ok ?? 0,
      ayuda: contador?.ayuda ?? 0,
      pendiente: contador?.pendiente ?? 0,
    };
  });

  return { eventoId, notificados, ok: totales.ok, ayuda: totales.ayuda, pendiente: totales.pendiente, porPunto };
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
