import Link from "next/link";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarTareasPanel, type TareaPanel } from "@/lib/tareas/cargar";
import { AccionesTarea } from "@/components/panel/tareas/acciones-tarea";
import { VincularEquipo } from "@/components/panel/tareas/vincular-equipo";
import { AgregarTarea } from "@/components/panel/tareas/agregar-tarea";
import {
  agruparPorSitio,
  armarArbol,
  coincideConRuta,
  diasDesde,
  DIAS_TAREA_VIEJA,
  MOTIVO_CIERRE_LABEL,
  type NodoArbol,
  type RutaTareas,
} from "@/lib/tareas/puro";

const MAX_LISTA = 100;
const MAX_GRUPOS = 60;
const NIVELES_RUTA = ["region", "provincia", "localidad", "sitio"] as const;

function hrefRuta(ruta: RutaTareas): string {
  const p = new URLSearchParams();
  for (const k of NIVELES_RUTA) if (ruta[k] !== undefined) p.set(k, ruta[k]!);
  const qs = p.toString();
  return qs ? `/panel/tareas?${qs}` : "/panel/tareas";
}

/** El nodo es la rama elegida o uno de sus ancestros (para dejarlo desplegado). */
function enCamino(nodo: NodoArbol, ruta: RutaTareas): boolean {
  return NIVELES_RUTA.every((k) => nodo.ruta[k] === undefined || nodo.ruta[k] === ruta[k]);
}
function esElegido(nodo: NodoArbol, ruta: RutaTareas): boolean {
  return NIVELES_RUTA.every((k) => nodo.ruta[k] === ruta[k]);
}

function Arbol({ nodos, ruta }: { nodos: NodoArbol[]; ruta: RutaTareas }) {
  return (
    <ul className="tareas-arbol-lista">
      {nodos.map((n) => {
        const clave = NIVELES_RUTA.map((k) => n.ruta[k] ?? "").join("|");
        const contenido = (
          <>
            <Link href={hrefRuta(n.ruta)} className={esElegido(n, ruta) ? "sel" : undefined}>
              {n.nombre}
            </Link>
            <span className="tareas-conteo">
              {n.abiertas}
              {n.viejas > 0 && (
                <span className="venc-badge warn" title={`${n.viejas} con más de ${DIAS_TAREA_VIEJA} días`}>
                  {n.viejas} viejas
                </span>
              )}
            </span>
          </>
        );
        return (
          <li key={clave}>
            {n.hijos.length > 0 ? (
              <details open={n.nivel === "region" || enCamino(n, ruta)}>
                <summary>{contenido}</summary>
                <Arbol nodos={n.hijos} ruta={ruta} />
              </details>
            ) : (
              <div className="tareas-hoja">{contenido}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });

function hrefExcel(ruta: RutaTareas): string {
  const p = new URLSearchParams();
  for (const k of NIVELES_RUTA) if (ruta[k] !== undefined) p.set(k, ruta[k]!);
  const qs = p.toString();
  return qs ? `/api/tareas/excel?${qs}` : "/api/tareas/excel";
}

function lugar(t: TareaPanel): string {
  return [t.provincia, t.localidad, t.sitio, t.planta, t.oficina].filter(Boolean).join(" · ");
}

function FilaTarea({ t, ahora, conLugar }: { t: TareaPanel; ahora: Date; conLugar: boolean }) {
  const abierta = t.estado === "abierta";
  const dias = diasDesde(t.created_at, ahora);
  const tono = dias > DIAS_TAREA_VIEJA * 2 ? "danger" : dias > DIAS_TAREA_VIEJA ? "warn" : "ok";
  return (
    <li className="tarea-item tarea-compacta">
      <div className="tarea-principal">
        <div className="tarea-texto">{t.texto}</div>
        <div className="item-sub">
          {conLugar && <>{lugar(t)} · </>}
          {abierta ? (
            <>
              <span className={`venc-badge ${tono}`}>hace {dias} {dias === 1 ? "día" : "días"}</span>
              {t.informe ? <> · Informe {t.informe.numero}</> : <> · cargada a mano</>}
            </>
          ) : (
            <>
              {t.estado === "resuelta" ? "Resuelta" : "Dada de baja"}
              {t.motivo_cierre && t.estado === "descartada" && <> — {MOTIVO_CIERRE_LABEL[t.motivo_cierre]}</>}
              {t.cerradaPor && <> · por {t.cerradaPor}</>}
              {t.cerrada_at && <> · {fmtFecha(t.cerrada_at)}</>}
              {t.informeCierre && <> · en la visita del Informe {t.informeCierre.numero}</>}
              {t.informe && <> · anotada en el Informe {t.informe.numero}</>}
              {t.comentario_cierre && <> · “{t.comentario_cierre}”</>}
              {t.equipo && <> · Equipo: {t.equipo.texto}</>}
            </>
          )}
        </div>
      </div>
      <div className="tarea-botones">
        {abierta && <VincularEquipo tareaId={t.id} ubicacionId={t.ubicacionId} equipo={t.equipo} />}
        <AccionesTarea id={t.id} abierta={abierta} />
      </div>
    </li>
  );
}

function nombreSitio(t: TareaPanel): string {
  return [t.oficina, t.planta, t.sitio].filter((v, i, arr) => v && arr.indexOf(v) === i).join(" · ");
}

export default async function PanelTareasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdminOrSupervisor();
  const sp = await searchParams;
  const supabase = await createClient();
  const todas = await cargarTareasPanel(supabase);
  const ahora = new Date();

  const verCerradas = sp.estado === "cerradas";
  const ruta: RutaTareas = {};
  for (const k of NIVELES_RUTA) if (sp[k]) ruta[k] = sp[k];

  const abiertas = todas.filter((t) => t.estado === "abierta");
  const cerradas = todas.filter((t) => t.estado !== "abierta");
  const viejas = abiertas.filter((t) => diasDesde(t.created_at, ahora) > DIAS_TAREA_VIEJA).length;
  const sitiosConPendientes = new Set(abiertas.map((t) => t.ubicacionId)).size;

  const arbol = armarArbol(abiertas, ahora);
  const lista = verCerradas
    ? cerradas
    : abiertas.filter((t) => coincideConRuta(t, ruta)); // ya vienen de la más vieja a la más nueva: lo más urgente arriba

  const grupos = verCerradas ? [] : agruparPorSitio(lista);

  const migas: { nombre: string; ruta: RutaTareas }[] = [];
  let acumulada: RutaTareas = {};
  for (const k of NIVELES_RUTA) {
    if (ruta[k] === undefined) break;
    acumulada = { ...acumulada, [k]: ruta[k] };
    migas.push({ nombre: ruta[k]!, ruta: acumulada });
  }

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Tareas pendientes</h1>
          <p>
            Lo que los técnicos dejaron anotado en sus informes, agrupado por ubicación. Se cargan solas al generar el informe; acá se
            resuelven o se dan de baja.
          </p>
        </div>
        <div className="tareas-barra">
          <AgregarTarea />
          <a className="btn btn-secondary" href={hrefExcel(ruta)} download>
            Descargar plan de visita (Excel)
          </a>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{abiertas.length}</div>
          <div className="kpi-label">Abiertas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{viejas}</div>
          <div className="kpi-label">Con más de {DIAS_TAREA_VIEJA} días</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{sitiosConPendientes}</div>
          <div className="kpi-label">Sitios con pendientes</div>
        </div>
      </div>

      <p className="tareas-solapas">
        <Link href="/panel/tareas" className={!verCerradas ? "sel" : undefined}>
          Abiertas ({abiertas.length})
        </Link>
        <Link href="/panel/tareas?estado=cerradas" className={verCerradas ? "sel" : undefined}>
          Cerradas
        </Link>
      </p>

      <div className={verCerradas ? undefined : "tareas-layout"}>
        {!verCerradas && (
          <aside className="card tareas-arbol">
            <div className="section-label">Por ubicación</div>
            {arbol.length === 0 ? <p className="empty-note">No hay tareas abiertas.</p> : <Arbol nodos={arbol} ruta={ruta} />}
          </aside>
        )}
        <section className="card">
          <div className="section-label">
            {verCerradas ? (
              "Cerradas recientemente"
            ) : (
              <>
                <Link href="/panel/tareas">Todas</Link>
                {migas.map((m) => (
                  <span key={m.nombre}>
                    {" › "}
                    <Link href={hrefRuta(m.ruta)}>{m.nombre}</Link>
                  </span>
                ))}
                {" · "}
                {lista.length} abierta{lista.length === 1 ? "" : "s"}
              </>
            )}
          </div>
          {lista.length === 0 ? (
            <p className="empty-note">{verCerradas ? "Todavía no se cerró ninguna." : "No hay tareas abiertas acá."}</p>
          ) : verCerradas ? (
            <ul className="tareas-lista">
              {lista.slice(0, MAX_LISTA).map((t) => (
                <FilaTarea key={t.id} t={t} ahora={ahora} conLugar />
              ))}
            </ul>
          ) : (
            <div className="tareas-grupos">
              {grupos.slice(0, MAX_GRUPOS).map((g) => {
                const primera = g.tareas[0];
                const viejasGrupo = g.tareas.filter((t) => diasDesde(t.created_at, ahora) > DIAS_TAREA_VIEJA).length;
                return (
                  <details key={g.ubicacionId} className="tarea-grupo" open={grupos.length <= 3}>
                    <summary>
                      <span className="tarea-grupo-titulo">
                        <strong>{nombreSitio(primera)}</strong>
                        <span className="item-sub">{[primera.region, primera.provincia, primera.localidad].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="tarea-grupo-conteo">
                        {g.tareas.length}
                        {viejasGrupo > 0 && <span className="venc-badge warn">{viejasGrupo} viejas</span>}
                      </span>
                    </summary>
                    <div className="tarea-grupo-cuerpo">
                      <ul className="tareas-lista">
                        {g.tareas.map((t) => (
                          <FilaTarea key={t.id} t={t} ahora={ahora} conLugar={false} />
                        ))}
                      </ul>
                      <div className="tarea-grupo-alta">
                        <AgregarTarea compacto sitio={{ id: g.ubicacionId, label: nombreSitio(primera) }} />
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          {verCerradas && lista.length > MAX_LISTA && <p className="hint">Se muestran las primeras {MAX_LISTA} de {lista.length}.</p>}
          {!verCerradas && grupos.length > MAX_GRUPOS && (
            <p className="hint">Se muestran los {MAX_GRUPOS} sitios con la tarea más vieja, de {grupos.length}: filtrá por ubicación para ver el resto.</p>
          )}
        </section>
      </div>
    </div>
  );
}
