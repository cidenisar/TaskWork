"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Ubicacion } from "./types";

export interface UbicacionRow extends Ubicacion {
  cantTableros: number;
  cantRacks: number;
  cantEquipos: number;
  cantInformes: number;
  cantRendiciones: number;
}

interface SitioAgrupado {
  clave: string;
  region: string;
  provincia: string;
  sitio: string;
  repId: string;
  filas: UbicacionRow[];
}

// Zonificación real de la operación (no alfabética) — el resto de las
// regiones que puedan aparecer (ej. una "Sin especificar" de datos viejos)
// se muestran después, ordenadas alfabéticamente.
const ORDEN_REGIONES = ["NOA", "NEA", "SUR"];

function ordenarPorNombre<T extends [string, unknown]>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Un mismo Sitio (ej. una refinería grande) puede tener muchas Plantas/
 * Oficinas cargadas en el catálogo, cada una su propia fila en
 * `ubicaciones` — acá se agrupan bajo un solo ítem de lista para no repetir
 * el nombre del sitio una vez por cada planta. El detalle (al entrar) sí
 * desglosa planta por planta.
 */
function agruparPorSitio(filas: UbicacionRow[]): SitioAgrupado[] {
  const map = new Map<string, SitioAgrupado>();
  for (const u of filas) {
    const clave = `${u.provincia}::${u.sitio}`;
    const g = map.get(clave);
    if (g) g.filas.push(u);
    else map.set(clave, { clave, region: u.region, provincia: u.provincia, sitio: u.sitio, repId: u.id, filas: [u] });
  }
  return [...map.values()];
}

const backBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  marginBottom: 10,
  font: "inherit",
};
const drillBtnStyle: React.CSSProperties = { width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" };

/**
 * `ubicaciones` ya viene filtrada desde la página (solo las que tienen algún
 * tablero/rack/equipo/informe/rendición — el catálogo completo de ~1747
 * sitios de Argentina no se muestra acá, es ruido para esta pantalla).
 * Navegación en 3 pasos, como estaba organizada la planilla original:
 * Región → Provincia → Sitio. El buscador de arriba es un atajo que ignora
 * el nivel en el que estás y busca en todo lo relevado de una.
 */
export function ListaUbicaciones({ ubicaciones }: { ubicaciones: UbicacionRow[] }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [provincia, setProvincia] = useState<string | null>(null);

  const q = query.trim().toLowerCase();

  const resultadosBusqueda = useMemo(() => {
    if (!q) return null;
    const filtradas = ubicaciones.filter((u) =>
      `${u.sitio} ${u.planta ?? ""} ${u.oficina ?? ""} ${u.localidad ?? ""} ${u.provincia} ${u.region}`.toLowerCase().includes(q),
    );
    return agruparPorSitio(filtradas);
  }, [ubicaciones, q]);

  const regiones = useMemo(() => {
    const map = new Map<string, UbicacionRow[]>();
    for (const u of ubicaciones) map.set(u.region, [...(map.get(u.region) ?? []), u]);
    const entries = [...map.entries()];
    const conocidas = entries.filter(([r]) => ORDEN_REGIONES.includes(r)).sort((a, b) => ORDEN_REGIONES.indexOf(a[0]) - ORDEN_REGIONES.indexOf(b[0]));
    const otras = ordenarPorNombre(entries.filter(([r]) => !ORDEN_REGIONES.includes(r)));
    return [...conocidas, ...otras];
  }, [ubicaciones]);

  const provinciasDeLaRegion = useMemo(() => {
    if (!region) return [];
    const map = new Map<string, UbicacionRow[]>();
    for (const u of ubicaciones) {
      if (u.region !== region) continue;
      map.set(u.provincia, [...(map.get(u.provincia) ?? []), u]);
    }
    return ordenarPorNombre([...map.entries()]);
  }, [ubicaciones, region]);

  const sitiosDeLaProvincia = useMemo(() => {
    if (!region || !provincia) return [];
    const filas = ubicaciones.filter((u) => u.region === region && u.provincia === provincia);
    return agruparPorSitio(filas).sort((a, b) => a.sitio.localeCompare(b.sitio));
  }, [ubicaciones, region, provincia]);

  function elegirRegion(r: string) {
    setRegion(r);
    setProvincia(null);
  }

  function filaSitio(g: SitioAgrupado) {
    const totales = {
      tableros: g.filas.reduce((s, u) => s + u.cantTableros, 0),
      racks: g.filas.reduce((s, u) => s + u.cantRacks, 0),
      equipos: g.filas.reduce((s, u) => s + u.cantEquipos, 0),
      informes: g.filas.reduce((s, u) => s + u.cantInformes, 0),
      rendiciones: g.filas.reduce((s, u) => s + u.cantRendiciones, 0),
    };
    const localidades = [...new Set(g.filas.map((u) => u.localidad).filter((v): v is string => Boolean(v)))];
    const metaPartes = [...localidades, g.provincia, g.region];
    return (
      <Link href={`/ubicaciones/${g.repId}`} className="hist-item" key={g.clave} style={{ textDecoration: "none", color: "inherit" }}>
        <div className="info">
          <div className="hist-main">
            <div className="hist-title">{g.sitio}</div>
            <div className="hist-meta">
              {metaPartes.join(" · ")}
              {g.filas.length > 1 ? ` · ${g.filas.length} plantas/oficinas` : ""}
            </div>
          </div>
        </div>
        <div className="hist-actions" style={{ gap: 6 }}>
          {totales.tableros > 0 && (
            <span className="chip">
              {totales.tableros} tablero{totales.tableros === 1 ? "" : "s"}
            </span>
          )}
          {totales.racks > 0 && (
            <span className="chip">
              {totales.racks} rack{totales.racks === 1 ? "" : "s"}
            </span>
          )}
          {totales.equipos > 0 && (
            <span className="chip">
              {totales.equipos} equipo{totales.equipos === 1 ? "" : "s"}
            </span>
          )}
          {totales.informes > 0 && (
            <span className="chip">
              {totales.informes} informe{totales.informes === 1 ? "" : "s"}
            </span>
          )}
          {totales.rendiciones > 0 && (
            <span className="chip">
              {totales.rendiciones} rendici{totales.rendiciones === 1 ? "ón" : "ones"}
            </span>
          )}
          <Icon name="chevron-right" size={15} />
        </div>
      </Link>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Sitios</h1>
        <p>Región → Provincia → Sitio — todo lo cargado en cada lugar: informes, rendiciones, tableros, racks y equipos.</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá directo por sala, sector/oficina o provincia...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {resultadosBusqueda ? (
          resultadosBusqueda.length === 0 ? (
            <div className="empty-note">No se encontraron ubicaciones con esa búsqueda.</div>
          ) : (
            <div style={{ marginTop: 12 }}>{resultadosBusqueda.map(filaSitio)}</div>
          )
        ) : ubicaciones.length === 0 ? (
          <div className="empty-note">
            Todavía no hay ningún lugar con equipamiento relevado — aparecen acá apenas cargues un tablero, un rack o un equipo.
          </div>
        ) : !region ? (
          <div style={{ marginTop: 12 }}>
            {regiones.map(([r, lista]) => {
              const provinciasEnRegion = new Set(lista.map((u) => u.provincia)).size;
              const sitiosEnRegion = new Set(lista.map((u) => `${u.provincia}::${u.sitio}`)).size;
              return (
                <button type="button" key={r} className="hist-item" style={drillBtnStyle} onClick={() => elegirRegion(r)}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">{r}</div>
                      <div className="hist-meta">
                        {provinciasEnRegion} provincia{provinciasEnRegion === 1 ? "" : "s"} · {sitiosEnRegion} sitio
                        {sitiosEnRegion === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className="hist-actions" style={{ gap: 6 }}>
                    <Icon name="chevron-right" size={15} />
                  </div>
                </button>
              );
            })}
          </div>
        ) : !provincia ? (
          <div style={{ marginTop: 12 }}>
            <button type="button" className="hint" style={backBtnStyle} onClick={() => setRegion(null)}>
              <Icon name="chevron-right" size={13} style={{ transform: "rotate(180deg)" }} /> Todas las regiones
            </button>
            <div className="section-label">{region}</div>
            {provinciasDeLaRegion.map(([p, lista]) => {
              const sitiosEnProvincia = new Set(lista.map((u) => u.sitio)).size;
              return (
                <button type="button" key={p} className="hist-item" style={drillBtnStyle} onClick={() => setProvincia(p)}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">{p}</div>
                      <div className="hist-meta">
                        {sitiosEnProvincia} sitio{sitiosEnProvincia === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className="hist-actions" style={{ gap: 6 }}>
                    <Icon name="chevron-right" size={15} />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <button type="button" className="hint" style={backBtnStyle} onClick={() => setProvincia(null)}>
              <Icon name="chevron-right" size={13} style={{ transform: "rotate(180deg)" }} /> {region}
            </button>
            <div className="section-label">
              {region} · {provincia}
            </div>
            {sitiosDeLaProvincia.map(filaSitio)}
          </div>
        )}
      </div>
    </div>
  );
}
