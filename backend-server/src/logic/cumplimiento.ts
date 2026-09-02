// Calcula el estado de cumplimiento del programa de simulacros — pura, sin
// I/O (ver test/cumplimiento.test.ts). El handler
// (src/handlers/cumplimiento.ts) trae el historial completo de
// simulacros_programados y llama a esto para GET /simulacros/cumplimiento.
//
// La granularidad es (sitio, tipo de evento) — no por sitio a secas: un
// sitio puede tener un programa de simulacros de Incendio al día y uno de
// Tóxico completamente vencido, mezclarlos en un solo estado por sitio
// escondería justo lo que un responsable de seguridad necesita ver.

import type { FilaHistorialSimulacro } from "../types.js";

export interface EstadoCumplimiento {
  sitioId: string;
  sitioNombre: string;
  tipoEventoId: string;
  tipoEventoNombre: string;
  /** El último simulacro que se resolvió (realizado o no_realizado) — null si nunca hubo ninguno de este (sitio, tipo). */
  ultimoResuelto: { fechaHora: string; estado: "realizado" | "no_realizado" } | null;
  /** El próximo programado, si el programa sigue vivo — null si no hay ninguno agendado. */
  proximoProgramado: string | null;
  /**
   * ¿Al día? — el último simulacro resuelto de este (sitio, tipo) fue
   * `realizado`, no `no_realizado`. Sin historial (`ultimoResuelto: null`)
   * cuenta como NO al día: no hay evidencia de que se haya probado nunca,
   * y eso es justamente lo que un auditor quiere ver marcado, no pasarlo
   * por alto en silencio.
   */
  alDia: boolean;
}

export function calcularCumplimiento(historial: FilaHistorialSimulacro[]): EstadoCumplimiento[] {
  const grupos = new Map<string, FilaHistorialSimulacro[]>();
  for (const fila of historial) {
    const clave = `${fila.sitioId}::${fila.tipoEventoId}`;
    const lista = grupos.get(clave);
    if (lista) {
      lista.push(fila);
    } else {
      grupos.set(clave, [fila]);
    }
  }

  const resultado: EstadoCumplimiento[] = [];
  for (const filas of grupos.values()) {
    const porFechaDesc = (a: FilaHistorialSimulacro, b: FilaHistorialSimulacro) =>
      new Date(b.fechaHora as string).getTime() - new Date(a.fechaHora as string).getTime();

    const resueltos = filas
      .filter((f) => (f.estado === "realizado" || f.estado === "no_realizado") && f.fechaHora !== null)
      .sort(porFechaDesc);
    const ultimoResuelto = resueltos[0]
      ? { fechaHora: resueltos[0].fechaHora as string, estado: resueltos[0].estado as "realizado" | "no_realizado" }
      : null;

    const programados = filas
      .filter((f) => f.estado === "programado" && f.fechaHora !== null)
      .sort((a, b) => new Date(a.fechaHora as string).getTime() - new Date(b.fechaHora as string).getTime());

    resultado.push({
      sitioId: filas[0].sitioId,
      sitioNombre: filas[0].sitioNombre,
      tipoEventoId: filas[0].tipoEventoId,
      tipoEventoNombre: filas[0].tipoEventoNombre,
      ultimoResuelto,
      proximoProgramado: programados[0]?.fechaHora ?? null,
      alDia: ultimoResuelto?.estado === "realizado",
    });
  }

  return resultado;
}
