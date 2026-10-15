import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPanelOverview } from "@/lib/panel/overview";
import { filtrarSitios, agruparPor, localidadKey, type FiltrosJerarquia } from "@/lib/panel/jerarquia";
import { JerarquiaBreadcrumb } from "@/components/panel/jerarquia-breadcrumb";
import { JerarquiaNodos } from "@/components/panel/jerarquia-nodos";
import { JerarquiaSitioPicker } from "@/components/panel/jerarquia-sitio-picker";
import { SitioDetalleCard } from "@/components/panel/sitio-detalle-card";

function fmtHoy(): string {
  return new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** A dónde lleva cada renglón de "Equipamiento relevado" — su propio historial. */
const HISTORIAL_POR_MODULO: Record<string, string> = {
  Tableros: "/tableros/historial",
  Racks: "/racks/historial",
  Torres: "/torres-comunicacion/historial",
  "Equipos Individuales": "/equipos/historial",
  Salas: "/salas/historial",
};

/** A dónde lleva cada renglón de "Informes" — su propio historial. */
const HISTORIAL_POR_INFORME: Record<string, string> = {
  "Informe Técnico": "/informe-tecnico/historial",
  "Rendición de Gastos": "/rendicion-gastos/historial",
  "Entregas a Depósito": "/entregas-deposito/historial",
  "Bajas de Equipamiento": "/bajas/historial",
};

/** Fila de un cuadro "kpi-card-multi" — si hay href, lleva a donde corresponde ese dato (historial, Plan de Mantenimiento, etc). */
function FilaKpi({ num, label, color, href }: { num: number; label: string; color?: string; href?: string }) {
  const contenido = (
    <>
      <span className="kpi-multi-num" style={color ? { color } : undefined}>
        {num}
      </span>
      <span className="kpi-multi-label">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} className="kpi-multi-row kpi-multi-row-link">
      {contenido}
    </Link>
  ) : (
    <div className="kpi-multi-row">{contenido}</div>
  );
}

interface PanelSearchParams {
  region?: string;
  provincia?: string;
  localidad?: string;
  sitio?: string;
  id?: string;
}

/**
 * Vista General ya no es una tabla plana de sitios — es un drill-down por
 * la jerarquía de Ubicaciones (región → provincia → localidad → sitio),
 * un nivel por vez con breadcrumb, usando los filtros de la URL
 * (searchParams). Cada nivel intermedio agrega lo que cuelga debajo
 * (consumo, cantidad de sitios/equipamiento, mantenimiento vencido); el
 * nivel final muestra el detalle de un sitio puntual, con la última visita
 * junto al estado del Plan de Mantenimiento (no tiene sentido mostrarla
 * suelta en un sitio sin mantenimiento configurado). Los 4 cuadros
 * superiores y "Vencimientos de flota" se quedan como resumen global — ni
 * el equipamiento agregado ni los vencimientos de técnicos/vehículos se
 * pueden repartir por zona.
 */
export default async function PanelPage({ searchParams }: { searchParams: Promise<PanelSearchParams> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const overview = await getPanelOverview(supabase);
  const { kpis, equipoPorModulo, sitios, vencimientos } = overview;

  const filtros: FiltrosJerarquia = { region: sp.region, provincia: sp.provincia, localidad: sp.localidad, sitio: sp.sitio };
  const filtrados = filtrarSitios(sitios, filtros);

  let contenido: React.ReactNode;
  if (filtros.sitio) {
    const candidato = sp.id ? filtrados.find((s) => s.id === sp.id) : filtrados.length === 1 ? filtrados[0] : undefined;
    if (candidato) {
      contenido = <SitioDetalleCard sitio={candidato} />;
    } else if (filtrados.length === 0) {
      contenido = <div className="empty-note">No se encontró equipamiento para este sitio.</div>;
    } else {
      contenido = <JerarquiaSitioPicker sitios={filtrados} filtros={filtros} />;
    }
  } else {
    const paramSiguiente: keyof FiltrosJerarquia = !filtros.region ? "region" : !filtros.provincia ? "provincia" : !filtros.localidad ? "localidad" : "sitio";
    const clave =
      paramSiguiente === "region"
        ? (s: (typeof filtrados)[number]) => s.region
        : paramSiguiente === "provincia"
          ? (s: (typeof filtrados)[number]) => s.provincia
          : paramSiguiente === "localidad"
            ? localidadKey
            : (s: (typeof filtrados)[number]) => s.sitioNombre;
    const nodos = agruparPor(filtrados, clave);
    contenido = <JerarquiaNodos nodos={nodos} filtrosBase={filtros} paramSiguiente={paramSiguiente} />;
  }

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Vista general</h1>
          <p>Zonas, sitios, consumo y vencimientos de un vistazo</p>
        </div>
        <div className="panel-topbar-meta">{fmtHoy()}</div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Equipamiento relevado</div>
          <div className="kpi-multi-rows">
            {equipoPorModulo.map((m) => (
              <FilaKpi key={m.modulo} num={m.cantidad} label={m.modulo} href={HISTORIAL_POR_MODULO[m.modulo]} />
            ))}
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Informes</div>
          <div className="kpi-multi-rows">
            {kpis.informesPorTipo.map((i) => (
              <FilaKpi key={i.label} num={i.cantidad} label={i.label} href={HISTORIAL_POR_INFORME[i.label]} />
            ))}
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Personal y flota</div>
          <div className="kpi-multi-rows">
            <FilaKpi num={kpis.tecnicosActivos} label="Técnicos activos" />
            <FilaKpi num={kpis.vehiculosTotal} label="Vehículos" href="/panel/vehiculos" />
          </div>
        </div>

        <div className="kpi-card kpi-card-multi">
          <div className="kpi-multi-title">Plan de Mantenimiento</div>
          <div className="kpi-multi-rows">
            <FilaKpi num={kpis.mantenimiento.hechos} label="Al día" color="var(--ok)" />
            <FilaKpi num={kpis.mantenimiento.porHacer} label="Por hacer" href="/panel/mantenimientos?filtro=porHacer" />
            <FilaKpi
              num={kpis.mantenimiento.vencidos}
              label="Vencidos"
              color={kpis.mantenimiento.vencidos > 0 ? "var(--accent-2)" : undefined}
              href="/panel/mantenimientos?filtro=vencido"
            />
            <FilaKpi num={kpis.mantenimiento.reprogramados} label="Reprogramados" href="/panel/mantenimientos?filtro=reprogramado" />
          </div>
        </div>
      </div>

      <div className="panel-grid-2">
        <div className="card">
          <div className="panel-card-title">
            <h2>Sitios por zona</h2>
            <span className="panel-card-count">
              {kpis.totalSitios} sitio{kpis.totalSitios === 1 ? "" : "s"}
              {kpis.consumoTotalW != null && ` · ${Math.round(kpis.consumoTotalW).toLocaleString("es-AR")} W estimados en total`}
            </span>
          </div>
          <div className="hint" style={{ margin: "-4px 0 10px" }}>
            El consumo es lo que la IA estimó al identificar marca/modelo de cada equipo, no una medición real — los equipos sin
            marca/modelo reconocido no suman al total.
          </div>
          <JerarquiaBreadcrumb filtros={filtros} />
          {contenido}
        </div>

        <div>
          <div className="card">
            <div className="panel-card-title">
              <h2>Vencimientos de flota</h2>
              <span className="panel-card-count">próximos {"≤"} 60 días o vencidos</span>
            </div>
            {vencimientos.length === 0 ? (
              <div className="empty-note">No hay vencimientos próximos ni vencidos cargados.</div>
            ) : (
              <div>
                {vencimientos.map((v, i) => (
                  <div className="panel-venc-row" key={`${v.tipo}-${v.nombre}-${i}`}>
                    <div className="panel-venc-info">
                      <div className="panel-venc-nombre">{v.nombre}</div>
                      <div className="panel-venc-tipo">{v.tipo}</div>
                    </div>
                    <div className="panel-venc-dias">
                      <span className={`venc-badge ${v.urgencia === "vencido" ? "danger" : "warn"}`}>
                        {v.urgencia === "vencido" ? `Vencido hace ${Math.abs(v.diasRestantes)}d` : `Vence en ${v.diasRestantes}d`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
