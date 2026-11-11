import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarAreaDe, cargarPeriodoVigente, calcularLiquidacion } from "@/lib/guardia/datos";
import { formatActivaciones } from "@/lib/guardia/motor";
import { formatMinutosHoras } from "@/lib/guardia/liquidacion";

function fmtFecha(fecha: string): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

export default async function MisHorasPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const area = await cargarAreaDe(supabase, profile.id);

  if (!area) {
    return (
      <div>
        <div className="page-heading">
          <h1>Mis horas</h1>
        </div>
        <div className="card">
          <p className="empty-note">No estás asignado a ninguna guardia — esto es solo para quien hace guardia.</p>
        </div>
      </div>
    );
  }

  const periodo = await cargarPeriodoVigente(supabase);
  const filas = periodo.desde && periodo.hasta ? await calcularLiquidacion(supabase, periodo.desde, periodo.hasta) : [];
  const mia = filas.find((f) => f.usuarioId === profile.id);
  const fechas = mia ? Object.keys(mia.detalle.porDia).sort() : [];

  return (
    <div>
      <div className="page-heading">
        <h1>Mis horas</h1>
        <p>
          Período {fmtFecha(periodo.desde)} – {fmtFecha(periodo.hasta)}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16, textAlign: "center" }}>
        <div className="section-label">Total del período</div>
        <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6 }}>{formatActivaciones(mia?.detalle.totalCentesimas ?? 0)}</div>
        <div className="item-sub">activaciones · {formatMinutosHoras(mia?.detalle.totalMinutos ?? 0)} hs</div>
      </div>

      <div className="card">
        <div className="section-label">Día por día</div>
        <div className="item-list" style={{ marginTop: 8 }}>
          {fechas.map((fecha) => {
            const dia = mia!.detalle.porDia[fecha];
            return (
              <div className="list-item" key={fecha}>
                <div className="info">
                  <div>
                    <div className="item-name">
                      {fmtFecha(fecha)} <span className="badge">{dia.tipoDia}</span>
                      {dia.enCurso && <span className="badge">En curso</span>}
                    </div>
                    <div className="item-sub">
                      {dia.eventos} {dia.eventos === 1 ? "evento" : "eventos"} · {formatMinutosHoras(dia.minutos)} hs
                    </div>
                  </div>
                </div>
                <div className="item-name">{formatActivaciones(dia.centesimas)}</div>
              </div>
            );
          })}
          {fechas.length === 0 && <p className="empty-note">Todavía no tenés activaciones en este período.</p>}
        </div>
      </div>
    </div>
  );
}
