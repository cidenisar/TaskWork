"use client";

import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ICON_PATHS } from "@/components/module-icon";

export interface PuntoMapaRelevamiento {
  id: string;
  nombreFino: string;
  lat: number;
  lng: number;
  porModulo: Record<string, number>;
  /** El ítem de mantenimiento más urgente de este sitio — null si no tiene nada con intervalo configurado (no es lo mismo que "al día"). */
  urgencia: "vencido" | "proximo" | "nunca" | "ok" | null;
}

/** Qué forma (de las de ModuleIcon) y bajo qué nombre de módulo (porModulo) le corresponde a cada marcador. */
const MODULOS: { modulo: string; iconKey: keyof typeof ICON_PATHS }[] = [
  { modulo: "Tableros", iconKey: "tableros" },
  { modulo: "Racks", iconKey: "racks" },
  { modulo: "Torres", iconKey: "torre-comunicacion" },
  { modulo: "Equipos Individuales", iconKey: "equipos" },
  { modulo: "Salas", iconKey: "salas" },
];

/** Mismos valores hex que --vencido/--warn/--ok en wireframe-ui.css (no cambian entre tema claro/oscuro) — acá no hay CSS custom properties disponibles porque Leaflet arma el HTML del marcador por fuera de React. */
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

function iconoMarcador(iconKey: keyof typeof ICON_PATHS, color: string): L.DivIcon {
  const svg = renderToStaticMarkup(
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[iconKey]}
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
 * Mapa de Vista General — un marcador por cada módulo presente en cada
 * sitio (no uno por sitio): así un mismo lugar con Tableros Y Racks
 * muestra las dos formas, y los filtros de módulo pueden prenderla o
 * apagarla por separado. Cuando hay más de un módulo en el mismo sitio se
 * abren en un pequeño círculo alrededor de la coordenada real para que no
 * queden tapados unos con otros. El color es el estado de mantenimiento
 * del SITIO completo (el ítem más urgente), no de ese módulo puntual —
 * tener eso por módulo requeriría cruzar el Plan de Mantenimiento por
 * cada equipo individual, que es más de lo que este primer corte necesita.
 */
export default function MapaRelevamientosInner({ puntos }: { puntos: PuntoMapaRelevamiento[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const capaMarcadoresRef = useRef<L.LayerGroup | null>(null);

  const [modulosVisibles, setModulosVisibles] = useState<Set<string>>(new Set(MODULOS.map((m) => m.modulo)));
  const [soloUrgentes, setSoloUrgentes] = useState(false);

  function toggleModulo(modulo: string) {
    setModulosVisibles((prev) => {
      const next = new Set(prev);
      if (next.has(modulo)) next.delete(modulo);
      else next.add(modulo);
      return next;
    });
  }

  // El mapa (centro/zoom/tiles) se crea una sola vez.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] = puntos.length
      ? [puntos.reduce((s, p) => s + p.lat, 0) / puntos.length, puntos.reduce((s, p) => s + p.lng, 0) / puntos.length]
      : [-34.6, -58.4];
    const map = L.map(containerRef.current, { center, zoom: puntos.length ? 6 : 4, scrollWheelZoom: false });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    capaMarcadoresRef.current = L.layerGroup().addTo(map);
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
    for (const p of puntos) {
      if (soloUrgentes && p.urgencia !== "vencido" && p.urgencia !== "proximo" && p.urgencia !== "nunca") continue;
      const color = colorDe(p.urgencia);
      const modulosDelSitio = MODULOS.filter((m) => modulosVisibles.has(m.modulo) && (p.porModulo[m.modulo] ?? 0) > 0);
      const n = modulosDelSitio.length;
      modulosDelSitio.forEach((m, i) => {
        const angulo = (2 * Math.PI * i) / n;
        const radioGrados = n > 1 ? 0.00012 : 0;
        const lat = p.lat + radioGrados * Math.cos(angulo);
        const lng = p.lng + radioGrados * Math.sin(angulo);
        L.marker([lat, lng], { icon: iconoMarcador(m.iconKey, color) })
          .bindPopup(
            `<b>${p.nombreFino}</b><br/>${m.modulo}: ${p.porModulo[m.modulo]}<br/><a href="/ubicaciones/${p.id}">Ver ficha completa</a>`,
          )
          .addTo(capa);
      });
    }
  }, [puntos, modulosVisibles, soloUrgentes]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {MODULOS.map((m) => (
          <button
            key={m.modulo}
            type="button"
            className="chip"
            onClick={() => toggleModulo(m.modulo)}
            style={{ opacity: modulosVisibles.has(m.modulo) ? 1 : 0.4 }}
          >
            {m.modulo}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setSoloUrgentes((v) => !v)} style={{ opacity: soloUrgentes ? 1 : 0.4 }}>
          Solo mantenimiento vencido/próximo
        </button>
      </div>
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
