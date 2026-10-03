import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icon";
import { labelUbicacion } from "@/components/ubicaciones/types";
import {
  calcularResumenEquipamiento as calcularResumenTableros,
  labelSubsistemas,
  CATEGORIA_EQUIPO_LABEL as TABLERO_CATEGORIA_LABEL,
} from "@/components/tableros/types";
import { calcularResumenEquipamiento as calcularResumenRacks, CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export default async function UbicacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: ubicacion } = await supabase
    .from("ubicaciones")
    .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
    .eq("id", id)
    .single();
  if (!ubicacion) notFound();

  const [tablerosRes, racksRes] = await Promise.all([
    supabase.from("tableros").select("id, denominacion, subsistemas").eq("ubicacion_id", id).order("denominacion"),
    supabase.from("racks").select("id, denominacion").eq("ubicacion_id", id).order("denominacion"),
  ]);
  const tableros = tablerosRes.data ?? [];
  const racks = racksRes.data ?? [];
  const tableroIds = tableros.map((t) => t.id);
  const rackIds = racks.map((r) => r.id);

  const [circuitosRes, equipamientosRes, medicionesRes, relevamientosRes] = await Promise.all([
    tableroIds.length > 0
      ? supabase.from("tablero_circuitos").select("tablero_id, categoria_equipo, tipo_circuito").in("tablero_id", tableroIds)
      : { data: [] },
    rackIds.length > 0 ? supabase.from("rack_equipamientos").select("rack_id, categoria_equipo, cantidad").in("rack_id", rackIds) : { data: [] },
    // Última fecha de medición/relevamiento por tablero-rack — respeta RLS (visible según el rol y quién lo cargó,
    // igual criterio que el resto de la app), es un dato "mejor esfuerzo", no una fuente de verdad de inventario.
    tableroIds.length > 0
      ? supabase.from("tablero_mediciones").select("tablero_id, fecha").in("tablero_id", tableroIds).order("fecha", { ascending: false })
      : { data: [] },
    rackIds.length > 0
      ? supabase.from("rack_relevamientos").select("rack_id, fecha").in("rack_id", rackIds).order("fecha", { ascending: false })
      : { data: [] },
  ]);

  const ultimaFechaTablero = new Map<string, string>();
  for (const m of medicionesRes.data ?? []) {
    if (!ultimaFechaTablero.has(m.tablero_id)) ultimaFechaTablero.set(m.tablero_id, m.fecha);
  }
  const ultimaFechaRack = new Map<string, string>();
  for (const r of relevamientosRes.data ?? []) {
    if (!ultimaFechaRack.has(r.rack_id)) ultimaFechaRack.set(r.rack_id, r.fecha);
  }

  const resumenTableros = calcularResumenTableros(
    (circuitosRes.data ?? []).map((c) => ({ categoriaEquipo: c.categoria_equipo, tipoCircuito: c.tipo_circuito })),
  );
  const resumenRacks = calcularResumenRacks((equipamientosRes.data ?? []).map((e) => ({ categoriaEquipo: e.categoria_equipo, cantidad: e.cantidad })));
  const totalEquipos = resumenTableros.total + resumenRacks.total;

  return (
    <div>
      <div className="page-heading">
        <Link href="/ubicaciones" className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <Icon name="chevron-right" size={13} style={{ transform: "rotate(180deg)" }} /> Todas las ubicaciones
        </Link>
        <h1>{ubicacion.sitio}</h1>
        <p>{[ubicacion.planta, ubicacion.localidad, ubicacion.provincia, ubicacion.region].filter(Boolean).join(" · ")}</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{tableros.length}</div>
          <div className="kpi-label">TABLEROS</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{racks.length}</div>
          <div className="kpi-label">RACKS</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{totalEquipos}</div>
          <div className="kpi-label">EQUIPAMIENTO TOTAL</div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Tableros en esta ubicación</div>
        {tableros.length === 0 ? (
          <div className="empty-note">No hay tableros relevados en {labelUbicacion(ubicacion)}.</div>
        ) : (
          <>
            {resumenTableros.porCategoria.length > 0 && (
              <div className="chip-row" style={{ marginTop: 0, marginBottom: 12 }}>
                {resumenTableros.porCategoria.map((c) => (
                  <span className="chip" key={c.categoria}>
                    {c.cantidad} {TABLERO_CATEGORIA_LABEL[c.categoria]}
                  </span>
                ))}
              </div>
            )}
            <div>
              {tableros.map((t) => {
                const fecha = ultimaFechaTablero.get(t.id);
                return (
                  <div className="hist-item" key={t.id}>
                    <div className="info">
                      <div className="hist-main">
                        <div className="hist-title">{t.denominacion}</div>
                        <div className="hist-meta">
                          {labelSubsistemas(t.subsistemas)}
                          {fecha ? ` · último relevamiento ${fmtFecha(fecha)}` : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="section-label">Racks en esta ubicación</div>
        {racks.length === 0 ? (
          <div className="empty-note">No hay racks relevados en {labelUbicacion(ubicacion)}.</div>
        ) : (
          <>
            {resumenRacks.porCategoria.length > 0 && (
              <div className="chip-row" style={{ marginTop: 0, marginBottom: 12 }}>
                {resumenRacks.porCategoria.map((c) => (
                  <span className="chip" key={c.categoria}>
                    {c.cantidad} {RACK_CATEGORIA_LABEL[c.categoria]}
                  </span>
                ))}
              </div>
            )}
            <div>
              {racks.map((r) => {
                const fecha = ultimaFechaRack.get(r.id);
                return (
                  <div className="hist-item" key={r.id}>
                    <div className="info">
                      <div className="hist-main">
                        <div className="hist-title">{r.denominacion}</div>
                        {fecha && <div className="hist-meta">último relevamiento {fmtFecha(fecha)}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
