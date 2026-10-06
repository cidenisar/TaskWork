import { createClient } from "@/lib/supabase/server";
import { getPanelVehiculos } from "@/lib/panel/vehiculos";
import { VencBadge } from "@/components/venc-badge";
import { Icon, StatusDot } from "@/components/icon";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export default async function PanelVehiculosPage() {
  const supabase = await createClient();
  const vehiculos = await getPanelVehiculos(supabase);

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Vehículos</h1>
          <p>Documentación y service de la flota</p>
        </div>
      </div>

      <div className="card">
        <div className="panel-card-title">
          <h2>Flota</h2>
          <span className="panel-card-count">
            {vehiculos.length} vehículo{vehiculos.length === 1 ? "" : "s"}
          </span>
        </div>
        {vehiculos.length === 0 ? (
          <div className="empty-note">Todavía no hay vehículos en el catálogo.</div>
        ) : (
          <div className="item-list">
            {vehiculos.map((v) => (
              <div className="list-item" key={v.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div className="info">
                  <div className="avatar">
                    <Icon name="truck" size={16} />
                  </div>
                  <div>
                    <div className="item-name">{v.patente}</div>
                    <div className="item-sub">{v.marcaModelo || "Sin marca/modelo"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <VencBadge label="Tarjeta Verde" fecha={v.vencimientoTarjetaVerde} />
                  <VencBadge label="RTO" fecha={v.vencimientoRto} />
                  {v.proximoService.estado ? (
                    <span className={`venc-badge ${v.proximoService.estado}`}>
                      <StatusDot tone={v.proximoService.estado} /> Service: {v.proximoService.mensaje}
                    </span>
                  ) : (
                    <span className="venc-badge">Service: {v.proximoService.mensaje}</span>
                  )}
                </div>
                <div className="item-sub">
                  Km actual: {v.kilometrajeActual != null ? v.kilometrajeActual.toLocaleString("es-AR") : "—"}
                  {v.ultimoService && (
                    <>
                      {" "}
                      · Último service: {v.ultimoService.kilometraje.toLocaleString("es-AR")} km ({fmtFecha(v.ultimoService.fecha)})
                    </>
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
