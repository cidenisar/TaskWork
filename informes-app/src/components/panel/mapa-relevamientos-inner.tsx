"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { ICON_PATHS } from "@/components/module-icon";
import type { ModuloMapa } from "@/lib/panel/mapa";

export interface PuntoMapaRelevamiento {
  id: string;
  ubicacionId: string;
  nombreSitio: string;
  lat: number;
  lng: number;
  modulo: ModuloMapa;
  categoria: string | null;
  categoriaLabel: string | null;
  label: string;
  /** El ítem de mantenimiento más urgente del SITIO (no de esta unidad puntual) — null si el sitio no tiene nada con intervalo configurado. */
  urgencia: "vencido" | "proximo" | "nunca" | "ok" | null;
}

/** Qué forma (de las de ModuleIcon) le corresponde a cada módulo. */
const ICON_KEY_POR_MODULO: Record<ModuloMapa, keyof typeof ICON_PATHS> = {
  Tableros: "tableros",
  Racks: "racks",
  Torres: "torre-comunicacion",
  "Equipos Individuales": "equipos",
  Salas: "salas",
};

const MODULOS: ModuloMapa[] = ["Tableros", "Racks", "Torres", "Equipos Individuales", "Salas"];

/** Mismos valores hex que --ok/--warn/--accent-2 en wireframe-ui.css (no cambian entre tema claro/oscuro) — acá no hay CSS custom properties disponibles porque Leaflet arma el HTML del marcador por fuera de React. */
const COLOR_URGENCIA: Record<string, string> = {
  vencido: "#ff3d3d",
  proximo: "#e0b23d",
  nunca: "#e0b23d",
  ok: "#35c46a",
  sin_seguimiento: "#8a8a92",
};

function colorDe(urgencia: PuntoMapaRelevamiento["urgencia"]): string {
  return COLOR_URGENCIA[urgencia ?? "sin_seguimiento"];
}

/** `label`/`nombreSitio` son texto libre que cualquier técnico escribe al dar de alta un tablero/rack/sala/equipo — Leaflet asigna el HTML del popup a innerHTML sin escapar, así que hay que hacerlo acá (si no, es un XSS persistente). */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function iconoMarcador(modulo: ModuloMapa, color: string): L.DivIcon {
  const svg = renderToStaticMarkup(
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[ICON_KEY_POR_MODULO[modulo]]}
    </svg>,
  );
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff">${svg}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

/**
 * Mapa de Vista General — un marcador por cada UNIDAD FÍSICA (un tablero,
 * un rack, una torre, un equipo individual, una sala), no un agregado por
 * sitio: dos salas del mismo lugar (una en PB, otra en 1° piso) son dos
 * marcadores distintos con su propio nombre, no uno solo con "Salas: 2".
 * Cuando quedan muy cerca en pantalla, Leaflet.markercluster los agrupa en
 * una burbuja con el número, y al tocarla (si no alcanza con acercar el
 * zoom) los "abre" en abanico para poder elegir cuál tocar — mismo
 * comportamiento que un cluster de Google Maps. El color sigue siendo el
 * estado de mantenimiento del SITIO completo (el ítem más urgente), no de
 * esa unidad puntual.
 */
export default function MapaRelevamientosInner({ puntos }: { puntos: PuntoMapaRelevamiento[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const capaMarcadoresRef = useRef<L.MarkerClusterGroup | null>(null);

  const [modulosVisibles, setModulosVisibles] = useState<Set<ModuloMapa>>(new Set(MODULOS));

  const categoriasEquipo = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const p of puntos) {
      if (p.modulo === "Equipos Individuales" && p.categoria && p.categoriaLabel && !vistas.has(p.categoria)) {
        vistas.set(p.categoria, p.categoriaLabel);
      }
    }
    return [...vistas.entries()].map(([categoria, label]) => ({ categoria, label })).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [puntos]);
  const [categoriasVisibles, setCategoriasVisibles] = useState<Set<string>>(new Set());
  // Arrancan todas prendidas una vez que se sabe qué categorías hay (puntos llega async desde el server).
  const categoriasInicializadas = useRef(false);
  useEffect(() => {
    if (categoriasInicializadas.current || categoriasEquipo.length === 0) return;
    categoriasInicializadas.current = true;
    setCategoriasVisibles(new Set(categoriasEquipo.map((c) => c.categoria)));
  }, [categoriasEquipo]);

  const [filtroVencido, setFiltroVencido] = useState(false);
  const [filtroProximo, setFiltroProximo] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  function toggleModulo(modulo: ModuloMapa) {
    setModulosVisibles((prev) => {
      const next = new Set(prev);
      if (next.has(modulo)) next.delete(modulo);
      else next.add(modulo);
      return next;
    });
  }
  function toggleCategoria(categoria: string) {
    setCategoriasVisibles((prev) => {
      const next = new Set(prev);
      if (next.has(categoria)) next.delete(categoria);
      else next.add(categoria);
      return next;
    });
  }

  // El mapa (centro/zoom/tiles) se crea una sola vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] = puntos.length
      ? [puntos.reduce((s, p) => s + p.lat, 0) / puntos.length, puntos.reduce((s, p) => s + p.lng, 0) / puntos.length]
      : [-34.6, -58.4];
    const map = L.map(containerRef.current, { center, zoom: puntos.length ? 6 : 4, scrollWheelZoom: true });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    capaMarcadoresRef.current = L.markerClusterGroup({ spiderfyOnMaxZoom: true, showCoverageOnHover: false, maxClusterRadius: 44 });
    capaMarcadoresRef.current.addTo(map);
    if (puntos.length > 1) {
      map.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30] });
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el mapa (centro/zoom inicial) se crea una sola vez, los marcadores se redibujan en el otro efecto
  }, []);

  // Los marcadores sí se redibujan cada vez que cambian los filtros.
  useEffect(() => {
    const capa = capaMarcadoresRef.current;
    if (!capa) return;
    capa.clearLayers();
    const q = busqueda.trim().toLowerCase();
    const filtroUrgenciaActivo = filtroVencido || filtroProximo;
    for (const p of puntos) {
      if (!modulosVisibles.has(p.modulo)) continue;
      if (p.categoria && !categoriasVisibles.has(p.categoria)) continue;
      if (filtroUrgenciaActivo) {
        const esVencido = p.urgencia === "vencido";
        const esProximo = p.urgencia === "proximo" || p.urgencia === "nunca";
        if (!((filtroVencido && esVencido) || (filtroProximo && esProximo))) continue;
      }
      if (q && !p.label.toLowerCase().includes(q) && !p.nombreSitio.toLowerCase().includes(q)) continue;
      const popupHtml = `<b>${escapeHtml(p.label)}</b><br/>${p.modulo}${p.categoriaLabel ? ` · ${escapeHtml(p.categoriaLabel)}` : ""}<br/>${escapeHtml(p.nombreSitio)}<br/><a href="/ubicaciones/${encodeURIComponent(p.ubicacionId)}">Ver ficha completa</a>`;
      L.marker([p.lat, p.lng], { icon: iconoMarcador(p.modulo, colorDe(p.urgencia)) }).bindPopup(popupHtml).addTo(capa);
    }
  }, [puntos, modulosVisibles, categoriasVisibles, filtroVencido, filtroProximo, busqueda]);

  return (
    <div>
      <input
        type="text"
        className="search-box"
        placeholder="Buscar por nombre (tablero, rack, sala...) o sitio..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {MODULOS.map((m) => (
          <button
            key={m}
            type="button"
            className="chip"
            onClick={() => toggleModulo(m)}
            style={{ opacity: modulosVisibles.has(m) ? 1 : 0.4 }}
          >
            {m}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => setFiltroVencido((v) => !v)}
          style={{ opacity: filtroVencido ? 1 : 0.4, borderColor: "#ff3d3d", color: filtroVencido ? "#ff3d3d" : undefined }}
        >
          Vencido
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => setFiltroProximo((v) => !v)}
          style={{ opacity: filtroProximo ? 1 : 0.4, borderColor: "#e0b23d", color: filtroProximo ? "#e0b23d" : undefined }}
        >
          Próximo/nunca
        </button>
      </div>
      {categoriasEquipo.length > 0 && modulosVisibles.has("Equipos Individuales") && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <span className="item-sub" style={{ alignSelf: "center", marginRight: 2 }}>
            Equipos Individuales:
          </span>
          {categoriasEquipo.map((c) => (
            <button
              key={c.categoria}
              type="button"
              className="chip"
              onClick={() => toggleCategoria(c.categoria)}
              style={{ opacity: categoriasVisibles.has(c.categoria) ? 1 : 0.4 }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div ref={containerRef} style={{ height: 420, borderRadius: "var(--radius)", overflow: "hidden" }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 11.5, color: "var(--text-faint)" }}>
        <span>
          <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#35c46a", marginRight: 4 }} />
          Al día
        </span>
        <span>
          <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#e0b23d", marginRight: 4 }} />
          Próximo/nunca
        </span>
        <span>
          <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#ff3d3d", marginRight: 4 }} />
          Vencido
        </span>
        <span>
          <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#8a8a92", marginRight: 4 }} />
          Sin mantenimiento configurado
        </span>
      </div>
    </div>
  );
}
