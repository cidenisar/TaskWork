"use client";

import dynamic from "next/dynamic";
import type { RutaMapaProps } from "./ruta-mapa-inner";

const RutaMapaInner = dynamic(() => import("./ruta-mapa-inner"), {
  ssr: false,
  loading: () => <div className="hint">Cargando mapa...</div>,
});

export function RutaMapa(props: RutaMapaProps) {
  return <RutaMapaInner {...props} />;
}
