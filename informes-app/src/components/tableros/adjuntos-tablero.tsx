"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { subirAdjuntoTableroAction, eliminarAdjuntoTableroAction } from "@/app/(app)/tableros/adjuntos-actions";

export interface AdjuntoTableroItem {
  id: string;
  nombre: string;
  url: string;
}

/**
 * Archivos sueltos adjuntados a un tablero (un unifilar propio, un PDF, una
 * foto del gabinete) — aparte del unifilar en vivo y el DXF que ya genera
 * "Nueva Medición". Cualquier técnico puede subir; solo Admin puede borrar.
 */
export function AdjuntosTablero({ tableroId, adjuntos, esAdmin }: { tableroId: string; adjuntos: AdjuntoTableroItem[]; esAdmin: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onArchivoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendo(true);
    setError(null);
    const formData = new FormData();
    formData.set("archivo", archivo);
    const res = await subirAdjuntoTableroAction(tableroId, formData);
    setSubiendo(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.success) setError(res.error || "No se pudo subir el archivo.");
  }

  async function onBorrar(adjuntoId: string) {
    setBorrandoId(adjuntoId);
    setError(null);
    const res = await eliminarAdjuntoTableroAction(adjuntoId);
    setBorrandoId(null);
    if (!res.success) setError(res.error || "No se pudo borrar el adjunto.");
  }

  return (
    <div style={{ marginTop: 8 }}>
      {adjuntos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
          {adjuntos.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="download" size={12} /> {a.nombre}
              </a>
              {esAdmin && (
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: 11.5, color: "var(--accent-2)" }}
                  onClick={() => void onBorrar(a.id)}
                  disabled={borrandoId === a.id}
                >
                  {borrandoId === a.id ? "Borrando..." : "Quitar"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <label className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: subiendo ? "default" : "pointer" }}>
        <Icon name="upload" size={12} /> {subiendo ? "Subiendo..." : "Adjuntar archivo"}
        <input ref={inputRef} type="file" onChange={(e) => void onArchivoElegido(e)} disabled={subiendo} style={{ display: "none" }} />
      </label>
      {error && (
        <div className="hint" style={{ color: "var(--accent-2)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
