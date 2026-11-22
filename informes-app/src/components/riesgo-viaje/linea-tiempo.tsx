import { evaluarCierre, formatearMinutos } from "@/lib/riesgo-viaje/demora";
import type { EstadoViaje } from "@/lib/database.types";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export interface DatosLineaTiempo {
  estado: EstadoViaje;
  /** Salida programada al cargar la evaluación. */
  fechaHora: string;
  iniciadoAt: string | null;
  puntoMedioAt: string | null;
  finalizadoAt: string | null;
  llegadaEstimadaAt: string | null;
  tienePuntoMedio: boolean;
}

/**
 * Los horarios del viaje, para saber después de cerrado qué pasó: cuándo estaba
 * programada la salida, cuándo salió de verdad, cuándo pasó por el punto medio,
 * a qué hora debía llegar y cuándo se marcó finalizado — con un cartel si se
 * pasó de su horario. Un paso que no se marcó se muestra "no se marcó" (un viaje
 * cerrado de un tirón por un Administrador no pasa por los pasos intermedios).
 */
export function LineaTiempoViaje({ v }: { v: DatosLineaTiempo }) {
  const finalizado = v.estado === "finalizado";
  const cierre = finalizado ? evaluarCierre({ finalizadoAt: v.finalizadoAt, llegadaEstimadaAt: v.llegadaEstimadaAt, iniciadoAt: v.iniciadoAt }) : null;
  const noMarcado = (iniciado: boolean) => (finalizado && !iniciado ? "no se marcó" : "—");

  return (
    <div className="hist-meta" style={{ marginTop: 6, display: "grid", gridTemplateColumns: "max-content 1fr", columnGap: 10, rowGap: 2 }}>
      <span>Salida programada</span>
      <span>{fmt(v.fechaHora)}</span>
      <span>Inició el viaje</span>
      <span>{v.iniciadoAt ? fmt(v.iniciadoAt) : noMarcado(false)}</span>
      {(v.tienePuntoMedio || v.puntoMedioAt) && (
        <>
          <span>Punto medio</span>
          <span>{v.puntoMedioAt ? fmt(v.puntoMedioAt) : noMarcado(false)}</span>
        </>
      )}
      <span>Llegada estimada</span>
      <span>{v.llegadaEstimadaAt ? fmt(v.llegadaEstimadaAt) : "no se cargó"}</span>
      <span>Finalizó</span>
      <span>{v.finalizadoAt ? fmt(v.finalizadoAt) : "—"}</span>
      {cierre && (
        <>
          <span>Resultado</span>
          <span>
            {cierre.fueraDeHorario === null ? (
              <span>Sin hora estimada de llegada para comparar</span>
            ) : cierre.fueraDeHorario ? (
              <span className="venc-badge danger">Fuera de horario: +{formatearMinutos(cierre.diferenciaMin!)} sobre lo estimado</span>
            ) : (
              <span className="venc-badge ok">En horario</span>
            )}
            {cierre.duracionMin !== null && cierre.duracionMin >= 0 ? ` · duró ${formatearMinutos(cierre.duracionMin)}` : ""}
          </span>
        </>
      )}
    </div>
  );
}
