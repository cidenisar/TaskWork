import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icon";
import {
  calcularResumenEquipamiento as calcularResumenTableros,
  categoriaLlevaAmp,
  itemMideCorriente,
  labelSubsistemas,
  CATEGORIA_EQUIPO_LABEL as TABLERO_CATEGORIA_LABEL,
} from "@/components/tableros/types";
import { calcularResumenEquipamiento as calcularResumenRacks, CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";
import { calcularResumenEquipos, CATEGORIA_EQUIPO_LABEL as EQUIPO_CATEGORIA_LABEL } from "@/components/equipos/types";
import { EstimarConsumoButton } from "@/components/ubicaciones/estimar-consumo-button";
import { estimarConsumoRacksAction, estimarConsumoEquiposAction } from "../actions";
import { puedeGestionarBajas, puedeGestionarDeposito } from "@/lib/types";
import { DarDeBajaButton } from "@/components/bajas/dar-de-baja-button";
import { DescargarBajaBoton } from "@/components/bajas/descargar-boton";
import { MOTIVO_BAJA_LABEL, TIPO_EQUIPO_BAJA_LABEL } from "@/components/bajas/types";
import { EntregarADepositoButton } from "@/components/deposito/entregar-boton";
import { VerComprobanteEntregaBoton } from "@/components/deposito/ver-comprobante-boton";
import { MOTIVO_ENTREGA_LABEL, CONDICION_LABEL, TIPO_EQUIPO_LABEL as TIPO_EQUIPO_DEPOSITO_LABEL } from "@/components/deposito/types";
import { RegistrarMantenimientoButton } from "@/components/mantenimiento/registrar-mantenimiento-button";
import { ProgramarMantenimientoButton } from "@/components/mantenimiento/programar-mantenimiento-button";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

function fmtCorriente(v: number | null) {
  return v === null || v === undefined ? "—" : String(v);
}

export default async function UbicacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: ubicacion } = await supabase
    .from("ubicaciones")
    .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
    .eq("id", id)
    .single();
  if (!ubicacion) notFound();

  // Un mismo Sitio puede tener varias Plantas/Oficinas cargadas en el
  // catálogo (filas de `ubicaciones` distintas) — acá se junta todo lo
  // relevado en cualquiera de ellas, porque en "Sitios" ya se agrupan bajo
  // un solo ítem de lista.
  const { data: hermanas } = await supabase
    .from("ubicaciones")
    .select("id, localidad, planta, oficina")
    .eq("provincia", ubicacion.provincia)
    .eq("sitio", ubicacion.sitio);
  const siblingIds = (hermanas ?? []).map((h) => h.id);
  const hayVariasPlantas = siblingIds.length > 1;
  const labelPorUbicacionId = new Map<string, string>();
  for (const h of hermanas ?? []) {
    labelPorUbicacionId.set(h.id, [h.oficina, h.planta, h.localidad].filter(Boolean).join(" · ") || "Sin planta/oficina especificada");
  }

  const [tablerosRes, racksRes, equiposRes, informesRes, rendicionesRes] = await Promise.all([
    supabase.from("tableros").select("id, denominacion, subsistemas, ubicacion_id").in("ubicacion_id", siblingIds).order("denominacion"),
    supabase.from("racks").select("id, denominacion, etiqueta_ypf, ubicacion_id").in("ubicacion_id", siblingIds).order("denominacion"),
    supabase
      .from("equipos")
      .select(
        "id, categoria_equipo, texto, marca_modelo, numero_serie, etiqueta_ypf, cantidad, consumo_promedio_w, consumo_max_w, ubicacion_id, estado",
      )
      .in("ubicacion_id", siblingIds)
      .order("texto"),
    // RLS (informes_tecnicos_select_own/select_stats) ya limita esto a informes propios, o todos si sos Admin/Supervisor.
    supabase
      .from("informes_tecnicos")
      .select("id, titulo, fecha, estado, ubicacion_id")
      .in("ubicacion_id", siblingIds)
      .order("fecha", { ascending: false }),
    // RLS (rendiciones_gastos_select_own/select_stats) ya limita esto a rendiciones propias, o todas si sos Admin/Supervisor.
    supabase
      .from("rendiciones_gastos")
      .select("id, motivo, fecha, estado, ubicacion_id")
      .in("ubicacion_id", siblingIds)
      .order("fecha", { ascending: false }),
  ]);
  const tableros = tablerosRes.data ?? [];
  const racks = racksRes.data ?? [];
  // Un equipo dado de baja o entregado a depósito ya no es equipamiento
  // activo del sitio — se muestra aparte, en sus propias secciones (que leen
  // bajas_equipamiento/entregas_deposito, no esta lista).
  const equipos = (equiposRes.data ?? []).filter((e) => e.estado === "activo");
  const informes = informesRes.data ?? [];
  const rendiciones = rendicionesRes.data ?? [];
  const tableroIds = tableros.map((t) => t.id);
  const rackIds = racks.map((r) => r.id);

  const [circuitosRes, equipamientosRes, medicionesRes, relevamientosRes, equipoRelevamientosRes] = await Promise.all([
    tableroIds.length > 0
      ? supabase
          .from("tablero_circuitos")
          .select("id, tablero_id, numero, texto, categoria_equipo, tipo_circuito, amp_nominal, estado")
          .in("tablero_id", tableroIds)
          .order("numero")
      : { data: [] },
    rackIds.length > 0
      ? supabase
          .from("rack_equipamientos")
          .select(
            "id, rack_id, numero, categoria_equipo, texto, marca_modelo, posicion_u, etiqueta_ypf, cantidad, consumo_promedio_w, consumo_max_w, estado",
          )
          .in("rack_id", rackIds)
          .order("numero")
      : { data: [] },
    // Última fecha de medición/relevamiento por tablero-rack — respeta RLS (visible según el rol y quién lo cargó,
    // igual criterio que el resto de la app), es un dato "mejor esfuerzo", no una fuente de verdad de inventario.
    tableroIds.length > 0
      ? supabase
          .from("tablero_mediciones")
          .select("id, tablero_id, fecha, tipo_evento")
          .in("tablero_id", tableroIds)
          .order("fecha", { ascending: false })
      : { data: [] },
    rackIds.length > 0
      ? supabase.from("rack_relevamientos").select("id, rack_id, fecha").in("rack_id", rackIds).order("fecha", { ascending: false })
      : { data: [] },
    supabase.from("equipo_relevamientos").select("id, ubicacion_id, fecha").in("ubicacion_id", siblingIds).order("fecha", { ascending: false }),
  ]);

  const circuitos = (circuitosRes.data ?? []).filter((c) => c.estado === "activo");
  const equipamientos = (equipamientosRes.data ?? []).filter((e) => e.estado === "activo");

  const ultimaFechaTablero = new Map<string, string>();
  const ultimaMedicionPorTablero = new Map<string, { id: string; tipoEvento: "medicion" | "relevamiento" }>();
  for (const m of medicionesRes.data ?? []) {
    if (!ultimaFechaTablero.has(m.tablero_id)) {
      ultimaFechaTablero.set(m.tablero_id, m.fecha);
      ultimaMedicionPorTablero.set(m.tablero_id, { id: m.id, tipoEvento: m.tipo_evento });
    }
  }
  const ultimaFechaRack = new Map<string, string>();
  const ultimoRelevamientoPorRack = new Map<string, string>();
  for (const r of relevamientosRes.data ?? []) {
    if (!ultimaFechaRack.has(r.rack_id)) {
      ultimaFechaRack.set(r.rack_id, r.fecha);
      ultimoRelevamientoPorRack.set(r.rack_id, r.id);
    }
  }
  const ultimoRelevamientoEquipoPorUbicacion = new Map<string, string>();
  for (const r of equipoRelevamientosRes.data ?? []) {
    if (!ultimoRelevamientoEquipoPorUbicacion.has(r.ubicacion_id)) ultimoRelevamientoEquipoPorUbicacion.set(r.ubicacion_id, r.id);
  }

  const medicionIds = [...ultimaMedicionPorTablero.values()].map((m) => m.id);
  const relevamientoRackIds = [...ultimoRelevamientoPorRack.values()];
  const relevamientoEquipoIds = [...ultimoRelevamientoEquipoPorUbicacion.values()];

  const [lecturasTableroRes, lecturasRackRes, lecturasEquipoRes] = await Promise.all([
    medicionIds.length > 0
      ? supabase
          .from("tablero_medicion_lecturas")
          .select("circuito_id, estado, corriente_f, corriente_r, corriente_s, corriente_t, comentario")
          .in("medicion_id", medicionIds)
      : { data: [] },
    relevamientoRackIds.length > 0
      ? supabase.from("rack_relevamiento_lecturas").select("equipamiento_id, estado, comentario").in("relevamiento_id", relevamientoRackIds)
      : { data: [] },
    relevamientoEquipoIds.length > 0
      ? supabase.from("equipo_relevamiento_lecturas").select("equipo_id, estado, comentario").in("relevamiento_id", relevamientoEquipoIds)
      : { data: [] },
  ]);
  const lecturaPorCircuito = new Map((lecturasTableroRes.data ?? []).map((l) => [l.circuito_id, l]));
  const lecturaPorEquipamiento = new Map((lecturasRackRes.data ?? []).map((l) => [l.equipamiento_id, l]));
  const lecturaPorEquipo = new Map((lecturasEquipoRes.data ?? []).map((l) => [l.equipo_id, l]));

  const equipoIndividualIds = equipos.map((e) => e.id);
  const rackEquipoIds = equipamientos.map((e) => e.id);
  const idsConMantenimiento = [...rackEquipoIds, ...equipoIndividualIds];
  const [programacionesRes, tecnicosRes, checklistItemsRes] = await Promise.all([
    idsConMantenimiento.length > 0
      ? supabase.from("mantenimiento_programaciones").select("tipo_equipo, equipo_id, fecha_programada, asignado_a, nota").in("equipo_id", idsConMantenimiento)
      : { data: [] },
    supabase.from("profiles").select("id, nombre_completo").eq("activo", true).order("nombre_completo"),
    supabase.from("mantenimiento_checklist_items").select("id, tipo_equipo, categoria, texto").order("orden"),
  ]);
  const programacionPorEquipo = new Map(
    (programacionesRes.data ?? []).map((p) => [
      `${p.tipo_equipo}:${p.equipo_id}`,
      { fechaProgramada: p.fecha_programada, asignadoA: p.asignado_a, nota: p.nota },
    ]),
  );
  const tecnicos = (tecnicosRes.data ?? []).map((t) => ({ id: t.id, nombreCompleto: t.nombre_completo }));
  const checklistPorCategoria = new Map<string, { id: string; texto: string }[]>();
  for (const item of checklistItemsRes.data ?? []) {
    const clave = `${item.tipo_equipo}:${item.categoria}`;
    checklistPorCategoria.set(clave, [...(checklistPorCategoria.get(clave) ?? []), { id: item.id, texto: item.texto }]);
  }

  const circuitosPorTablero = new Map<string, typeof circuitos>();
  for (const c of circuitos) circuitosPorTablero.set(c.tablero_id, [...(circuitosPorTablero.get(c.tablero_id) ?? []), c]);
  const equipamientosPorRack = new Map<string, typeof equipamientos>();
  for (const e of equipamientos) equipamientosPorRack.set(e.rack_id, [...(equipamientosPorRack.get(e.rack_id) ?? []), e]);

  const resumenTableros = calcularResumenTableros(circuitos.map((c) => ({ categoriaEquipo: c.categoria_equipo, tipoCircuito: c.tipo_circuito })));
  const resumenRacks = calcularResumenRacks(equipamientos.map((e) => ({ categoriaEquipo: e.categoria_equipo, cantidad: e.cantidad })));
  const resumenEquipos = calcularResumenEquipos(equipos.map((e) => ({ categoriaEquipo: e.categoria_equipo, cantidad: e.cantidad })));
  const totalEquipos = resumenTableros.total + resumenRacks.total + resumenEquipos.total;

  const puedeBajas = puedeGestionarBajas(profile.rol);
  // bajas_equipamiento guarda su propia "foto" del equipo al momento de la baja
  // (RLS bajas_equipamiento_select ya limita esto a Admin/Supervisor) — no hace
  // falta cruzar con las tablas de origen para mostrar esta sección.
  const { data: bajasData } = puedeBajas
    ? await supabase
        .from("bajas_equipamiento")
        .select("id, numero_generacion, tipo_equipo, equipo_texto, equipo_categoria, motivo, comentario, fecha, pdf_url")
        .in("ubicacion_id", siblingIds)
        .order("fecha", { ascending: false })
    : { data: [] };
  const bajas = bajasData ?? [];

  const puedeDeposito = puedeGestionarDeposito(profile.rol);
  // entregas_deposito también guarda su propia "foto" al momento de la
  // entrega — mismo criterio que bajas_equipamiento, no hace falta cruzar
  // con las tablas de origen. Cubre los dos orígenes (equipo ya cargado o
  // material libre) porque ambos quedan con el mismo ubicacion_id.
  const { data: entregasData } = puedeDeposito
    ? await supabase
        .from("entregas_deposito")
        .select("id, numero_generacion, origen, tipo_equipo, descripcion, categoria, cantidad, condicion, motivo, comentario, fecha, pdf_url")
        .in("ubicacion_id", siblingIds)
        .order("fecha", { ascending: false })
    : { data: [] };
  const entregas = entregasData ?? [];

  return (
    <div>
      <div className="page-heading">
        <Link href="/ubicaciones" className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <Icon name="chevron-right" size={13} style={{ transform: "rotate(180deg)" }} /> Todos los sitios
        </Link>
        <h1>{ubicacion.sitio}</h1>
        <p>
          {[ubicacion.provincia, ubicacion.region].filter(Boolean).join(" · ")}
          {hayVariasPlantas ? ` · ${siblingIds.length} plantas/oficinas agrupadas` : ""}
        </p>
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
          <div className="kpi-value">{equipos.length}</div>
          <div className="kpi-label">EQUIPOS INDIVIDUALES</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{totalEquipos}</div>
          <div className="kpi-label">EQUIPAMIENTO TOTAL</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{informes.length}</div>
          <div className="kpi-label">INFORMES TÉCNICOS</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{rendiciones.length}</div>
          <div className="kpi-label">RENDICIONES DE GASTOS</div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Tableros en este sitio</div>
        <div className="hint" style={{ margin: "0 0 10px" }}>
          Tocá un tablero para ver sus circuitos/elementos — mismo detalle que el PDF, con la última lectura conocida.
        </div>
        {tableros.length === 0 ? (
          <div className="empty-note">No hay tableros relevados en {ubicacion.sitio}.</div>
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
                const tipoEvento = ultimaMedicionPorTablero.get(t.id)?.tipoEvento ?? "medicion";
                const circuitosDelTablero = circuitosPorTablero.get(t.id) ?? [];
                const mostrarCorriente = circuitosDelTablero.some((c) => categoriaLlevaAmp(c.categoria_equipo));
                return (
                  <details className="detalle-item" key={t.id}>
                    <summary>
                      <div className="info">
                        <div className="hist-main">
                          <div className="hist-title">{t.denominacion}</div>
                          <div className="hist-meta">
                            {hayVariasPlantas ? `${labelPorUbicacionId.get(t.ubicacion_id)} · ` : ""}
                            {labelSubsistemas(t.subsistemas)}
                            {fecha ? ` · último relevamiento ${fmtFecha(fecha)}` : ""}
                          </div>
                        </div>
                      </div>
                      <Icon name="chevron-right" size={15} className="detalle-chevron" />
                    </summary>
                    {circuitosDelTablero.length === 0 ? (
                      <div className="empty-note" style={{ margin: "0 14px 14px" }}>
                        Sin circuitos/elementos cargados.
                      </div>
                    ) : (
                      <div className="detalle-table-wrap">
                        <table className="detalle-table">
                          <thead>
                            <tr>
                              <th>N°</th>
                              <th>Circuito/Elemento</th>
                              <th>Categoría</th>
                              <th>Estado</th>
                              {mostrarCorriente && (
                                <>
                                  <th style={{ textAlign: "right" }}>Nominal</th>
                                  <th style={{ textAlign: "right" }}>F</th>
                                  <th style={{ textAlign: "right" }}>R</th>
                                  <th style={{ textAlign: "right" }}>S</th>
                                  <th style={{ textAlign: "right" }}>T</th>
                                </>
                              )}
                              <th>Comentario</th>
                              {(puedeBajas || puedeDeposito) && <th />}
                            </tr>
                          </thead>
                          <tbody>
                            {circuitosDelTablero.map((c) => {
                              const lectura = lecturaPorCircuito.get(c.id);
                              const mideCorriente = itemMideCorriente(c.categoria_equipo, c.tipo_circuito, tipoEvento);
                              return (
                                <tr key={c.id}>
                                  <td>{c.numero}</td>
                                  <td>{c.texto}</td>
                                  <td>{TABLERO_CATEGORIA_LABEL[c.categoria_equipo]}</td>
                                  <td>{lectura?.estado || "—"}</td>
                                  {mostrarCorriente && (
                                    <>
                                      <td style={{ textAlign: "right" }}>{c.amp_nominal || "—"}</td>
                                      <td style={{ textAlign: "right" }}>{mideCorriente ? fmtCorriente(lectura?.corriente_f ?? null) : "—"}</td>
                                      <td style={{ textAlign: "right" }}>{mideCorriente ? fmtCorriente(lectura?.corriente_r ?? null) : "—"}</td>
                                      <td style={{ textAlign: "right" }}>{mideCorriente ? fmtCorriente(lectura?.corriente_s ?? null) : "—"}</td>
                                      <td style={{ textAlign: "right" }}>{mideCorriente ? fmtCorriente(lectura?.corriente_t ?? null) : "—"}</td>
                                    </>
                                  )}
                                  <td>{lectura?.comentario || "—"}</td>
                                  {(puedeBajas || puedeDeposito) && (
                                    <td>
                                      <div style={{ display: "flex", gap: 6 }}>
                                        {puedeBajas && <DarDeBajaButton tipoEquipo="tablero_circuito" equipoId={c.id} equipoTexto={c.texto} />}
                                        {puedeDeposito && (
                                          <EntregarADepositoButton tipoEquipo="tablero_circuito" equipoId={c.id} equipoTexto={c.texto} />
                                        )}
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="section-label">Racks en este sitio</div>
        <div className="hint" style={{ margin: "0 0 10px" }}>
          Tocá un rack para ver su equipamiento — categoría, marca/modelo y posición U, con el último estado conocido y el consumo
          estimado por IA (nunca una medición real).
        </div>
        {racks.length > 0 && profile.rol === "admin" && (
          <div style={{ marginBottom: 10 }}>
            <EstimarConsumoButton accion={estimarConsumoRacksAction.bind(null, rackIds)} />
          </div>
        )}
        {racks.length === 0 ? (
          <div className="empty-note">No hay racks relevados en {ubicacion.sitio}.</div>
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
                const equipamientosDelRack = equipamientosPorRack.get(r.id) ?? [];
                return (
                  <details className="detalle-item" key={r.id}>
                    <summary>
                      <div className="info">
                        <div className="hist-main">
                          <div className="hist-title">
                            {r.denominacion}
                            {r.etiqueta_ypf ? ` · YPF ${r.etiqueta_ypf}` : ""}
                          </div>
                          <div className="hist-meta">
                            {hayVariasPlantas && `${labelPorUbicacionId.get(r.ubicacion_id)}`}
                            {fecha ? `${hayVariasPlantas ? " · " : ""}último relevamiento ${fmtFecha(fecha)}` : ""}
                          </div>
                        </div>
                      </div>
                      <Icon name="chevron-right" size={15} className="detalle-chevron" />
                    </summary>
                    {equipamientosDelRack.length === 0 ? (
                      <div className="empty-note" style={{ margin: "0 14px 14px" }}>
                        Sin equipamiento cargado.
                      </div>
                    ) : (
                      <div className="detalle-table-wrap">
                        <table className="detalle-table">
                          <thead>
                            <tr>
                              <th>N°</th>
                              <th>Categoría</th>
                              <th>Equipo</th>
                              <th>Marca/Modelo</th>
                              <th>Posición U</th>
                              <th>Etiqueta YPF</th>
                              <th style={{ textAlign: "right" }}>Cant.</th>
                              <th style={{ textAlign: "right" }}>Cons. prom.</th>
                              <th style={{ textAlign: "right" }}>Cons. máx.</th>
                              <th>Estado</th>
                              <th>Comentario</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {equipamientosDelRack.map((e) => {
                              const lectura = lecturaPorEquipamiento.get(e.id);
                              return (
                                <tr key={e.id}>
                                  <td>{e.numero}</td>
                                  <td>{RACK_CATEGORIA_LABEL[e.categoria_equipo]}</td>
                                  <td>{e.texto}</td>
                                  <td>{e.marca_modelo || "—"}</td>
                                  <td>{e.posicion_u || "—"}</td>
                                  <td>{e.etiqueta_ypf || "—"}</td>
                                  <td style={{ textAlign: "right" }}>{e.cantidad}</td>
                                  <td style={{ textAlign: "right" }}>{e.consumo_promedio_w ? `~${e.consumo_promedio_w}W` : "—"}</td>
                                  <td style={{ textAlign: "right" }}>{e.consumo_max_w ? `~${e.consumo_max_w}W` : "—"}</td>
                                  <td>{lectura?.estado || "—"}</td>
                                  <td>{lectura?.comentario || "—"}</td>
                                  <td>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <RegistrarMantenimientoButton
                                        tipoEquipo="rack_equipamiento"
                                        equipoId={e.id}
                                        equipoTexto={e.texto}
                                        checklistItems={checklistPorCategoria.get(`rack_equipamiento:${e.categoria_equipo}`) ?? []}
                                      />
                                      <ProgramarMantenimientoButton
                                        tipoEquipo="rack_equipamiento"
                                        equipoId={e.id}
                                        equipoTexto={e.texto}
                                        tecnicos={tecnicos}
                                        programacionActual={programacionPorEquipo.get(`rack_equipamiento:${e.id}`) ?? null}
                                      />
                                      {puedeBajas && <DarDeBajaButton tipoEquipo="rack_equipamiento" equipoId={e.id} equipoTexto={e.texto} />}
                                      {puedeDeposito && (
                                        <EntregarADepositoButton tipoEquipo="rack_equipamiento" equipoId={e.id} equipoTexto={e.texto} />
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="section-label">Equipos individuales en este sitio</div>
        {equipos.length > 0 && profile.rol === "admin" && (
          <div style={{ marginBottom: 10 }}>
            <EstimarConsumoButton accion={estimarConsumoEquiposAction.bind(null, siblingIds)} />
          </div>
        )}
        {equipos.length === 0 ? (
          <div className="empty-note">No hay equipos individuales relevados en {ubicacion.sitio}.</div>
        ) : (
          <>
            {resumenEquipos.porCategoria.length > 0 && (
              <div className="chip-row" style={{ marginTop: 0, marginBottom: 12 }}>
                {resumenEquipos.porCategoria.map((c) => (
                  <span className="chip" key={c.categoria}>
                    {c.cantidad} {EQUIPO_CATEGORIA_LABEL[c.categoria]}
                  </span>
                ))}
              </div>
            )}
            <div className="detalle-table-wrap">
              <table className="detalle-table">
                <thead>
                  <tr>
                    <th>Equipo</th>
                    {hayVariasPlantas && <th>Planta/Oficina</th>}
                    <th>Categoría</th>
                    <th>Marca/Modelo</th>
                    <th>N° Serie</th>
                    <th>Etiqueta YPF</th>
                    <th style={{ textAlign: "right" }}>Cant.</th>
                    <th style={{ textAlign: "right" }}>Cons. prom.</th>
                    <th style={{ textAlign: "right" }}>Cons. máx.</th>
                    <th>Estado</th>
                    <th>Comentario</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {equipos.map((e) => {
                    const lectura = lecturaPorEquipo.get(e.id);
                    return (
                      <tr key={e.id}>
                        <td>{e.texto}</td>
                        {hayVariasPlantas && <td>{labelPorUbicacionId.get(e.ubicacion_id)}</td>}
                        <td>{EQUIPO_CATEGORIA_LABEL[e.categoria_equipo]}</td>
                        <td>{e.marca_modelo || "—"}</td>
                        <td>{e.numero_serie || "—"}</td>
                        <td>{e.etiqueta_ypf || "—"}</td>
                        <td style={{ textAlign: "right" }}>{e.cantidad}</td>
                        <td style={{ textAlign: "right" }}>{e.consumo_promedio_w ? `~${e.consumo_promedio_w}W` : "—"}</td>
                        <td style={{ textAlign: "right" }}>{e.consumo_max_w ? `~${e.consumo_max_w}W` : "—"}</td>
                        <td>{lectura?.estado || "—"}</td>
                        <td>{lectura?.comentario || "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <RegistrarMantenimientoButton
                              tipoEquipo="equipo_individual"
                              equipoId={e.id}
                              equipoTexto={e.texto}
                              checklistItems={checklistPorCategoria.get(`equipo_individual:${e.categoria_equipo}`) ?? []}
                            />
                            <ProgramarMantenimientoButton
                              tipoEquipo="equipo_individual"
                              equipoId={e.id}
                              equipoTexto={e.texto}
                              tecnicos={tecnicos}
                              programacionActual={programacionPorEquipo.get(`equipo_individual:${e.id}`) ?? null}
                            />
                            {puedeBajas && <DarDeBajaButton tipoEquipo="equipo_individual" equipoId={e.id} equipoTexto={e.texto} />}
                            {puedeDeposito && (
                              <EntregarADepositoButton tipoEquipo="equipo_individual" equipoId={e.id} equipoTexto={e.texto} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {puedeBajas && bajas.length > 0 && (
        <div className="card">
          <div className="section-label">Equipamiento dado de baja en este sitio</div>
          <div className="hint" style={{ margin: "0 0 10px" }}>
            Retirado del equipamiento activo por rotura, ampliación u obsolescencia — comprobante entregado a depósito.
          </div>
          <div className="list-grid">
            {bajas.map((b) => (
              <div className="hist-item" key={b.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">{b.equipo_texto}</div>
                    <div className="hist-meta">
                      {b.numero_generacion} · {TIPO_EQUIPO_BAJA_LABEL[b.tipo_equipo]} ({b.equipo_categoria}) · {MOTIVO_BAJA_LABEL[b.motivo]} ·{" "}
                      {fmtFecha(b.fecha)}
                    </div>
                    {b.comentario && (
                      <div className="hist-meta" style={{ marginTop: 4 }}>
                        {b.comentario}
                      </div>
                    )}
                  </div>
                </div>
                <div className="hist-actions">
                  {b.pdf_url ? (
                    <DescargarBajaBoton bajaId={b.id} />
                  ) : (
                    <span className="hint">Sin comprobante</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {puedeDeposito && entregas.length > 0 && (
        <div className="card">
          <div className="section-label">Entregado a depósito desde este sitio</div>
          <div className="hint" style={{ margin: "0 0 10px" }}>
            Material/equipo (nuevo o usado-funcional) devuelto al depósito — comprobante de constancia.
          </div>
          <div className="list-grid">
            {entregas.map((en) => (
              <div className="hist-item" key={en.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">{en.descripcion}</div>
                    <div className="hist-meta">
                      {en.numero_generacion} · {en.tipo_equipo ? TIPO_EQUIPO_DEPOSITO_LABEL[en.tipo_equipo] : "Material libre"}
                      {en.categoria ? ` (${en.categoria})` : ""} · {CONDICION_LABEL[en.condicion]} · x{en.cantidad} ·{" "}
                      {MOTIVO_ENTREGA_LABEL[en.motivo]} · {fmtFecha(en.fecha)}
                    </div>
                    {en.comentario && (
                      <div className="hist-meta" style={{ marginTop: 4 }}>
                        {en.comentario}
                      </div>
                    )}
                  </div>
                </div>
                <div className="hist-actions">
                  {en.pdf_url ? <VerComprobanteEntregaBoton entregaId={en.id} /> : <span className="hint">Sin comprobante</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="wide-grid">
        <div className="wide-cell card">
          <div className="section-label">Informes Técnicos en este sitio</div>
          {informes.length === 0 ? (
            <div className="empty-note">No hay informes técnicos cargados en {ubicacion.sitio}.</div>
          ) : (
            <div>
              {informes.map((i) => (
                <div className="hist-item" key={i.id}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">{i.titulo}</div>
                      <div className="hist-meta">
                        {hayVariasPlantas && i.ubicacion_id ? `${labelPorUbicacionId.get(i.ubicacion_id)} · ` : ""}
                        {fmtFecha(i.fecha)} · {i.estado === "generado" ? "Generado" : "Borrador"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="wide-cell card">
          <div className="section-label">Rendiciones de Gastos en este sitio</div>
          {rendiciones.length === 0 ? (
            <div className="empty-note">No hay rendiciones de gastos cargadas en {ubicacion.sitio}.</div>
          ) : (
            <div>
              {rendiciones.map((r) => (
                <div className="hist-item" key={r.id}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">{r.motivo}</div>
                      <div className="hist-meta">
                        {hayVariasPlantas && r.ubicacion_id ? `${labelPorUbicacionId.get(r.ubicacion_id)} · ` : ""}
                        {fmtFecha(r.fecha)} · {r.estado === "cerrada" ? "Cerrada" : "Abierta"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
