import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { getResumenLecturasIa } from "@/lib/tableros/obtener-lecturas-ia";
import { BarList } from "@/components/estadisticas/bar-list";

function fmtUsd(valor: number): string {
  return `US$ ${valor.toFixed(valor < 10 ? 3 : 2)}`;
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function TablerosLecturasIaPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás ver el costo de lectura de tableros con IA." />;
  }

  const supabase = await createClient();
  const resumen = await getResumenLecturasIa(supabase);

  return (
    <div>
      <div className="page-heading">
        <h1>Lectura de tableros con IA</h1>
        <p>
          Costo y acierto de la &ldquo;lectura detallada&rdquo; (botón en Nueva Medición → Circuitos/Elementos) — gasto estimado a partir
          del consumo real de tokens.
        </p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{fmtUsd(resumen.costoMesActualUsd)}</div>
          <div className="kpi-label">Costo este mes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{resumen.lecturasMesActual}</div>
          <div className="kpi-label">Lecturas este mes</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{resumen.porcentajeAciertoPromedio != null ? `${resumen.porcentajeAciertoPromedio}%` : "—"}</div>
          <div className="kpi-label">Acierto promedio (campos sin tocar)</div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Costo por tablero (este mes)</div>
        <BarList
          items={resumen.costoPorTablero.map((t) => ({
            label: t.tableroDenominacion,
            value: t.costoUsd,
            displayValue: `${fmtUsd(t.costoUsd)} · ${t.lecturas} lectura${t.lecturas === 1 ? "" : "s"}`,
          }))}
        />
      </div>

      <div className="card">
        <div className="section-label">Lecturas de este mes</div>
        {resumen.ultimasLecturas.length === 0 ? (
          <div className="empty-note">Sin lecturas este mes todavía.</div>
        ) : (
          <div className="detalle-table-wrap">
            <table className="detalle-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tablero</th>
                  <th>Técnico</th>
                  <th>Modelo</th>
                  <th>Tokens</th>
                  <th>Costo</th>
                  <th>Acierto</th>
                </tr>
              </thead>
              <tbody>
                {resumen.ultimasLecturas.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtFecha(l.fecha)}</td>
                    <td>{l.tableroId ? (l.tableroDenominacion ?? "—") : <span className="hint">Sin guardar</span>}</td>
                    <td>{l.tecnicoNombre ?? "—"}</td>
                    <td>{l.modelo}</td>
                    <td>{(l.inputTokens + l.outputTokens).toLocaleString("es-AR")}</td>
                    <td>{fmtUsd(l.costoUsd)}</td>
                    <td>{l.porcentajeAcierto != null ? `${l.porcentajeAcierto}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Cómo se calcula el acierto</div>
        <p className="hint" style={{ margin: 0 }}>
          Por cada circuito que vino de una lectura IA se compara, campo por campo (destino/etiqueta, calibre, categoría, tipo de
          circuito), el valor que devolvió la IA contra el valor con el que finalmente quedó guardado — el % es cuántos de esos campos el
          técnico NO tuvo que corregir. Un circuito que el técnico borró cuenta como 0% de esa fila.
        </p>
      </div>
    </div>
  );
}
