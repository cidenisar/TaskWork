import Link from "next/link";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarBaterias, resumirBaterias, type FilaBateria } from "@/lib/baterias/cargar";
import { BATERIA_DESTINO_LABEL, BATERIA_ORIGEN_LABEL, UPS_BATERIAS_LABEL } from "@/lib/baterias/types";
import { EditarBateriaButton } from "@/components/panel/baterias/editar-bateria";

const MAX_FILAS = 300;

function clase(f: FilaBateria): string {
  if (f.rol === "banco") return f.datos.bateriaDestino ? `Banco de ${BATERIA_DESTINO_LABEL[f.datos.bateriaDestino]}` : "Banco (destino sin definir)";
  if (f.rol === "ups") return `UPS${f.datos.upsBaterias ? ` · ${UPS_BATERIAS_LABEL[f.datos.upsBaterias].toLowerCase()}` : ""}`;
  return "Rectificador";
}

export default async function PanelBateriasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminOrSupervisor();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const todas = await cargarBaterias(supabase);
  const resumen = resumirBaterias(todas);

  const filtradas = q
    ? todas.filter((f) => [f.sitio, f.texto, f.marcaModelo, f.rack ?? "", f.vinculadoA ?? "", f.datos.bateriaTipo, f.datos.potenciaNominal].join(" ").toLowerCase().includes(q))
    : todas;
  const filas = filtradas.slice(0, MAX_FILAS);

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Baterías</h1>
          <p>
            Bancos de baterías, UPS y rectificadores de todos los sitios: a qué equipo pertenece cada banco, cuántas baterías lleva y de qué
            tipo, para saber cuántas hay que comprar cuando toca cambiarlas.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{resumen.totalBaterias}</div>
          <div className="kpi-label">Baterías cargadas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{resumen.bancos}</div>
          <div className="kpi-label">Bancos de baterías</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{resumen.sinCantidad}</div>
          <div className="kpi-label">Sin cantidad cargada</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{resumen.bancosSinVincular}</div>
          <div className="kpi-label">Bancos sin vincular</div>
        </div>
      </div>

      {resumen.porTipo.length > 0 && (
        <div className="card">
          <div className="section-label">Baterías por tipo</div>
          <div className="chip-row" style={{ marginTop: 6 }}>
            {resumen.porTipo.map((t) => (
              <span className="chip" key={t.tipo}>
                {t.total} × {t.tipo}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-label">Equipos con baterías ({filtradas.length})</div>
        <form method="get" style={{ display: "flex", gap: 8, margin: "8px 0 12px", flexWrap: "wrap" }}>
          <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por sitio, equipo, modelo, tipo de batería…" style={{ flex: 1, minWidth: 220 }} />
          <button type="submit" className="btn btn-secondary btn-sm">
            Buscar
          </button>
          {q && (
            <Link href="/panel/baterias" className="btn btn-secondary btn-sm">
              Limpiar
            </Link>
          )}
        </form>

        {filas.length === 0 ? (
          <p className="empty-note">
            {todas.length === 0
              ? "Todavía no hay bancos de baterías, UPS ni rectificadores cargados."
              : "Ningún equipo coincide con la búsqueda."}
          </p>
        ) : (
          <div className="detalle-table-wrap">
            <table className="detalle-table">
              <thead>
                <tr>
                  <th>Sitio</th>
                  <th>Equipo</th>
                  <th>Clase</th>
                  <th>Vinculado a</th>
                  <th>Potencia</th>
                  <th style={{ textAlign: "right" }}>Baterías</th>
                  <th>Tipo</th>
                  <th>Dato</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.tipo}:${f.id}`}>
                    <td>{f.sitio}</td>
                    <td>
                      {f.texto}
                      {f.marcaModelo && <div className="hist-meta">{f.marcaModelo}</div>}
                      {f.rack && <div className="hist-meta">Rack {f.rack}</div>}
                    </td>
                    <td>{clase(f)}</td>
                    <td>{f.vinculadoA ?? "—"}</td>
                    <td>{f.datos.potenciaNominal || "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {f.total ?? "—"}
                      {f.total && f.cantidad > 1 && <div className="hist-meta">{f.cantidad} × {f.datos.bateriaCantidad}</div>}
                    </td>
                    <td>{f.datos.bateriaTipo || "—"}</td>
                    <td>
                      {f.datos.bateriaCantidad && f.datos.bateriaOrigen ? (
                        <span className={f.datos.bateriaOrigen === "por_modelo" ? "venc-badge warn" : undefined}>{BATERIA_ORIGEN_LABEL[f.datos.bateriaOrigen]}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <EditarBateriaButton
                        tipo={f.tipo}
                        id={f.id}
                        categoria={f.categoria}
                        texto={f.texto}
                        ubicacionId={f.ubicacionId}
                        datos={f.datos}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtradas.length > MAX_FILAS && (
          <p className="hint" style={{ marginTop: 8 }}>
            Se muestran los primeros {MAX_FILAS} de {filtradas.length} — usá el buscador para acotar.
          </p>
        )}
      </div>
    </div>
  );
}
