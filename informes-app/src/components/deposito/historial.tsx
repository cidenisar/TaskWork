"use client";

import { useMemo, useState } from "react";
import { obtenerUrlPdfEntregaAction, obtenerUrlsFotosEvidenciaEntregaAction } from "@/app/(app)/entregas-deposito/historial/actions";
import { Icon } from "@/components/icon";
import { MOTIVO_ENTREGA_LABEL, CONDICION_LABEL, TIPO_EQUIPO_LABEL } from "./types";
import type { CondicionMaterial, MotivoEntregaDeposito, OrigenEntregaDeposito, TipoEquipoBaja } from "@/lib/database.types";

export interface HistorialEntregaRow {
  id: string;
  numeroGeneracion: string;
  origen: OrigenEntregaDeposito;
  tipoEquipo: TipoEquipoBaja | null;
  descripcion: string;
  categoria: string | null;
  cantidad: number;
  condicion: CondicionMaterial;
  motivo: MotivoEntregaDeposito;
  comentario: string | null;
  fecha: string;
  ubicacionLabel: string;
  pdfDisponible: boolean;
  fotosDisponibles: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialEntregas({ entregas }: { entregas: HistorialEntregaRow[] }) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entregas;
    return entregas.filter((e) =>
      `${e.numeroGeneracion} ${e.descripcion} ${e.categoria ?? ""} ${e.ubicacionLabel} ${MOTIVO_ENTREGA_LABEL[e.motivo]}`
        .toLowerCase()
        .includes(q),
    );
  }, [entregas, query]);

  async function verComprobante(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfEntregaAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function verFotos(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlsFotosEvidenciaEntregaAction(id);
    setBusyId(null);
    if (res.urls.length === 0) {
      setNotice(res.error || "No se pudieron abrir las fotos.");
      return;
    }
    res.urls.forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial de Entregas a Depósito</h1>
        <p>Material y equipo (nuevo o usado-funcional) devuelto al depósito — comprobante de constancia</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por material, categoría, sitio o motivo...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtradas.length === 0 ? (
          <div className="empty-note">No se encontraron entregas con esa búsqueda.</div>
        ) : (
          <div className="list-grid">
            {filtradas.map((e) => (
              <div className={`hist-item${e.pdfDisponible ? "" : " archived"}`} key={e.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">
                      {e.descripcion}
                      <span className={`hist-status ${e.pdfDisponible ? "ok" : "gone"}`}>
                        {e.pdfDisponible ? "PDF disponible" : "Solo registro"}
                      </span>
                    </div>
                    <div className="hist-meta">
                      {e.numeroGeneracion} · {e.tipoEquipo ? TIPO_EQUIPO_LABEL[e.tipoEquipo] : "Material libre"}
                      {e.categoria ? ` (${e.categoria})` : ""} · {CONDICION_LABEL[e.condicion]} · x{e.cantidad} ·{" "}
                      {MOTIVO_ENTREGA_LABEL[e.motivo]} · {e.ubicacionLabel} · {fmtFecha(e.fecha)}
                    </div>
                    {e.comentario && <div className="hist-meta" style={{ marginTop: 4 }}>{e.comentario}</div>}
                  </div>
                </div>
                <div className="hist-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={e.fotosDisponibles ? "Ver fotos de evidencia" : "Sin fotos de evidencia"}
                    disabled={!e.fotosDisponibles || busyId === e.id}
                    onClick={() => verFotos(e.id)}
                  >
                    {busyId === e.id ? "…" : <Icon name="camera" size={15} />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={e.pdfDisponible ? "Ver comprobante" : "Sin comprobante disponible"}
                    disabled={!e.pdfDisponible || busyId === e.id}
                    onClick={() => verComprobante(e.id)}
                  >
                    {busyId === e.id ? "…" : <Icon name="eye" size={15} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
