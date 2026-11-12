import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { cargarPeriodoVigente, calcularLiquidacion, cargarParametros, cargarSemanasLiquidacion } from "@/lib/guardia/datos";
import { formatActivaciones } from "@/lib/guardia/motor";
import { formatMinutosHoras } from "@/lib/guardia/liquidacion";
import { CerrarPeriodoButton } from "@/components/guardia/cerrar-periodo-button";
import { CerrarSemanaButton } from "@/components/guardia/cerrar-semana-button";
import { Icon } from "@/components/icon";

const PAGINA = 30;

function fmtFecha(fecha: string): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

export default async function LiquidacionPage({ searchParams }: { searchParams: Promise<{ limite?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const periodo = await cargarPeriodoVigente(supabase);

  const filas = periodo.desde && periodo.hasta ? await calcularLiquidacion(supabase, periodo.desde, periodo.hasta) : [];
  const { data: cierreVigente } =
    periodo.desde && periodo.hasta
      ? await supabase
          .from("guardia_periodo_cierre")
          .select("id, cerrado_at")
          .eq("tipo", "global")
          .eq("desde", periodo.desde)
          .eq("hasta", periodo.hasta)
          .maybeSingle()
      : { data: null };

  const limite = Math.max(PAGINA, Number(sp.limite) || PAGINA);
  const { data: cierres, count } = await supabase
    .from("guardia_periodo_cierre")
    .select("id, desde, hasta, cerrado_at", { count: "exact" })
    .eq("tipo", "global")
    .order("cerrado_at", { ascending: false })
    .range(0, limite - 1);
  const totalCierres = count ?? 0;
  const quedan = Math.max(0, totalCierres - (cierres?.length ?? 0));

  const parametros = await cargarParametros(supabase);
  const semanas = await cargarSemanasLiquidacion(supabase, parametros.cambioMin);

  const totalGeneral = filas.reduce((acc, f) => acc + f.detalle.totalCentesimas, 0);
  const totalFrancosGeneral = filas.reduce((acc, f) => acc + f.detalle.totalFrancos, 0);

  return (
    <div>
      <div className="page-heading">
        <h1>Liquidación</h1>
        <p>
          Período vigente: {fmtFecha(periodo.desde)} – {fmtFecha(periodo.hasta)}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="section-label">Total del período</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{formatActivaciones(totalGeneral)} activaciones</div>
            {totalFrancosGeneral > 0 && <div className="item-sub">+ {formatActivaciones(totalFrancosGeneral)} francos compensatorios</div>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={`/api/guardia/liquidacion/excel?desde=${periodo.desde}&hasta=${periodo.hasta}`} className="btn btn-secondary btn-sm">
              <Icon name="download" size={13} /> Bajar Excel
            </a>
            {cierreVigente ? (
              <span className="badge">Cerrado {new Date(cierreVigente.cerrado_at).toLocaleDateString("es-AR")}</span>
            ) : (
              <CerrarPeriodoButton />
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Semanas</div>
        <p className="empty-note">Cada semana de guardia (miércoles a martes) se puede cerrar apenas termina, sin esperar al período completo.</p>
        <div className="item-list" style={{ marginTop: 8 }}>
          {semanas.map((s) => (
            <div className="list-item" key={s.semanaInicio}>
              <div className="info">
                <div className="item-name">
                  {fmtFecha(s.semanaInicio)} – {fmtFecha(s.semanaFin)}
                </div>
              </div>
              {s.cerrada && s.cierreId ? (
                <Link href={`/panel/guardia/liquidacion/${s.cierreId}`} className="btn btn-secondary btn-sm" style={{ textDecoration: "none" }}>
                  Cerrada — ver detalle
                </Link>
              ) : (
                <CerrarSemanaButton semanaInicio={s.semanaInicio} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Por persona</div>
        <div className="item-list" style={{ marginTop: 8 }}>
          {filas.map((f) => (
            <div className="list-item" key={f.usuarioId}>
              <div className="info">
                <div>
                  <div className="item-name">
                    {f.nombre} <span className="badge">{f.area}</span>
                  </div>
                  <div className="item-sub">
                    {Object.keys(f.detalle.porDia).length} días con activación · {formatMinutosHoras(f.detalle.totalMinutos)} hs
                    {f.detalle.totalFrancos > 0 && ` · ${formatActivaciones(f.detalle.totalFrancos)} francos`}
                  </div>
                </div>
              </div>
              <div className="item-name">{formatActivaciones(f.detalle.totalCentesimas)}</div>
            </div>
          ))}
          {filas.length === 0 && <p className="empty-note">No hay nadie cargado en Personas, o falta configurar el período en Parámetros.</p>}
        </div>
      </div>

      <div className="card">
        <div className="section-label">Períodos cerrados</div>
        <div className="item-list" style={{ marginTop: 8 }}>
          {(cierres ?? []).map((c) => (
            <Link href={`/panel/guardia/liquidacion/${c.id}`} key={c.id} className="list-item" style={{ textDecoration: "none" }}>
              <div className="info">
                <div>
                  <div className="item-name">
                    {fmtFecha(c.desde)} – {fmtFecha(c.hasta)}
                  </div>
                  <div className="item-sub">Cerrado {new Date(c.cerrado_at).toLocaleDateString("es-AR")}</div>
                </div>
              </div>
            </Link>
          ))}
          {(cierres ?? []).length === 0 && <p className="empty-note">Todavía no se cerró ningún período.</p>}
        </div>
        {quedan > 0 && (
          <Link href={`/panel/guardia/liquidacion?limite=${limite + PAGINA}`} className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>
            Ver {Math.min(PAGINA, quedan)} más (quedan {quedan})
          </Link>
        )}
      </div>
    </div>
  );
}
