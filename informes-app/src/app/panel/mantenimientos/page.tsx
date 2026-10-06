import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPanelMantenimientos } from "@/lib/panel/mantenimientos";
import { Icon } from "@/components/icon";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

const BADGE_CLASE: Record<string, string> = { vencido: "danger", proximo: "warn", nunca: "warn", ok: "ok" };

export default async function PanelMantenimientosPage() {
  const supabase = await createClient();
  const items = await getPanelMantenimientos(supabase);
  const pendientes = items.filter((i) => i.urgencia !== "ok");

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Mantenimientos</h1>
          <p>Plan de mantenimiento de Racks y Equipos Individuales, con pronóstico de lluvia para lo que ya está vencido o próximo</p>
        </div>
      </div>

      <div className="card">
        <div className="panel-card-title">
          <h2>Plan de mantenimiento</h2>
          <span className="panel-card-count">
            {items.length} equipo{items.length === 1 ? "" : "s"} con intervalo configurado
          </span>
        </div>

        {items.length === 0 ? (
          <div className="empty-note">
            Todavía no hay intervalos de mantenimiento configurados — definilos en{" "}
            <Link href="/configuracion">Configuración → Mantenimiento</Link> para que esta pantalla empiece a avisar.
          </div>
        ) : pendientes.length === 0 ? (
          <div className="empty-note">Todo al día — ningún equipo con intervalo configurado está vencido ni próximo a vencer.</div>
        ) : (
          <div className="item-list">
            {pendientes.map((item) => (
              <div className="list-item" key={`${item.tipoEquipo}-${item.equipoId}`} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                <div className="info">
                  <div className="avatar">
                    <Icon name="wrench" size={16} />
                  </div>
                  <div>
                    <div className="item-name">{item.texto}</div>
                    <div className="item-sub">
                      {item.tipoEquipoLabel} · {item.categoriaLabel} · {item.ubicacionLabel}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span className={`venc-badge ${BADGE_CLASE[item.urgencia]}`}>{item.mensaje}</span>
                  <span className="item-sub">
                    Cada {item.frecuenciaDias} días{item.ultimaFecha ? ` · Último: ${fmtFecha(item.ultimaFecha)}` : ""}
                  </span>
                  {item.clima?.lluviaProxima && (
                    <span className="venc-badge warn">
                      <Icon name="warning" size={11} /> Lluvia prevista en los próximos días ({Math.round(item.clima.probabilidadMaxima)}%) —
                      evaluá reprogramar
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
