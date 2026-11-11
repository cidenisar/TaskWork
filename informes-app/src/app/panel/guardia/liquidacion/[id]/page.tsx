import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatActivaciones } from "@/lib/guardia/motor";
import { formatMinutosHoras, type FichaPersonaDetalle } from "@/lib/guardia/liquidacion";
import { Icon } from "@/components/icon";

interface FilaCongelada {
  usuarioId: string;
  nombre: string;
  area: string;
  detalle: FichaPersonaDetalle;
}

function fmtFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

export default async function PeriodoCerradoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: cierre } = await supabase
    .from("guardia_periodo_cierre")
    .select("id, desde, hasta, cerrado_at, cerrado_por, resultado_json, tipo")
    .eq("id", id)
    .maybeSingle();
  if (!cierre) notFound();

  const { data: quienCerro } = await supabase.from("profiles").select("nombre_completo").eq("id", cierre.cerrado_por).maybeSingle();

  // Foto congelada al momento del cierre — nunca se recalcula, aunque hoy los parámetros sean otros.
  // Un cierre guardado antes de que existieran los francos no tiene ese campo en la foto — 0 por defecto.
  const filas = (cierre.resultado_json as FilaCongelada[] | null) ?? [];
  const totalGeneral = filas.reduce((acc, f) => acc + f.detalle.totalCentesimas, 0);
  const totalFrancosGeneral = filas.reduce((acc, f) => acc + (f.detalle.totalFrancos ?? 0), 0);
  const esSemanal = cierre.tipo === "semanal";

  return (
    <div>
      <div className="page-heading">
        <h1>
          {esSemanal ? "Semana" : "Período"} {fmtFecha(cierre.desde)} – {fmtFecha(cierre.hasta)}
        </h1>
        <p>
          Cerrado el {new Date(cierre.cerrado_at).toLocaleString("es-AR")} por {quienCerro?.nombre_completo ?? "—"} — congelado, no se recalcula
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="section-label">
              Total {esSemanal ? "de la semana" : "del período"} <span className="badge">{esSemanal ? "Semanal" : "Período"}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{formatActivaciones(totalGeneral)} activaciones</div>
            {totalFrancosGeneral > 0 && <div className="item-sub">+ {formatActivaciones(totalFrancosGeneral)} francos compensatorios</div>}
          </div>
          <a href={`/api/guardia/liquidacion/${cierre.id}/excel`} className="btn btn-secondary btn-sm">
            <Icon name="download" size={13} /> Bajar Excel
          </a>
        </div>
      </div>

      <div className="card">
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
                    {(f.detalle.totalFrancos ?? 0) > 0 && ` · ${formatActivaciones(f.detalle.totalFrancos)} francos`}
                  </div>
                </div>
              </div>
              <div className="item-name">{formatActivaciones(f.detalle.totalCentesimas)}</div>
            </div>
          ))}
          {filas.length === 0 && <p className="empty-note">Nadie tuvo activaciones en este período.</p>}
        </div>
      </div>
    </div>
  );
}
