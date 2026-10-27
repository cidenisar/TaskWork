"use client";

import { useMemo, useState } from "react";
import {
  obtenerUrlPdfBajaAction,
  confirmarEntregaDepositoAction,
  eliminarBajaAction,
  actualizarBajaAction,
} from "@/app/(app)/bajas/historial/actions";
import { Icon } from "@/components/icon";
import { MOTIVO_BAJA_OPCIONES, MOTIVO_BAJA_LABEL, TIPO_EQUIPO_BAJA_LABEL } from "./types";
import type { MotivoBaja, TipoEquipoBaja } from "@/lib/database.types";

export interface HistorialBajaRow {
  id: string;
  numeroGeneracion: string;
  tipoEquipo: TipoEquipoBaja;
  equipoTexto: string;
  equipoCategoria: string;
  motivo: MotivoBaja;
  comentario: string | null;
  fecha: string;
  ubicacionLabel: string;
  pdfDisponible: boolean;
  entregadoDepositoAt: string | null;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HistorialBajas({ bajas: bajasIniciales, esAdmin }: { bajas: HistorialBajaRow[]; esAdmin: boolean }) {
  const [bajas, setBajas] = useState(bajasIniciales);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editando, setEditando] = useState<HistorialBajaRow | null>(null);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bajas;
    return bajas.filter((b) =>
      `${b.numeroGeneracion} ${b.equipoTexto} ${b.equipoCategoria} ${b.ubicacionLabel} ${MOTIVO_BAJA_LABEL[b.motivo]}`
        .toLowerCase()
        .includes(q),
    );
  }, [bajas, query]);

  async function verComprobante(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfBajaAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  const [entregas, setEntregas] = useState<Record<string, string>>({});

  async function confirmarEntrega(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await confirmarEntregaDepositoAction(id);
    setBusyId(null);
    if (!res.success) {
      setNotice(res.error || "No se pudo confirmar la entrega.");
      return;
    }
    setEntregas((prev) => ({ ...prev, [id]: new Date().toISOString() }));
  }

  async function eliminar(id: string, equipoTexto: string) {
    if (!window.confirm(`¿Borrar definitivamente la baja de "${equipoTexto}"? El equipo vuelve a quedar activo. Esto no se puede deshacer.`)) return;
    setBusyId(id);
    setNotice(null);
    const res = await eliminarBajaAction(id);
    setBusyId(null);
    if (!res.success) {
      setNotice(res.error || "No se pudo borrar la baja.");
      return;
    }
    setBajas((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial de Bajas</h1>
        <p>Equipamiento dado de baja por rotura, ampliación u obsolescencia — comprobante para entregar a depósito</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por equipo, categoría, sitio o motivo...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtradas.length === 0 ? (
          <div className="empty-note">No se encontraron bajas con esa búsqueda.</div>
        ) : (
          <div className="list-grid">
            {filtradas.map((b) => {
              const entregadoAt = entregas[b.id] ?? b.entregadoDepositoAt;
              return (
                <div className={`hist-item${b.pdfDisponible ? "" : " archived"}`} key={b.id}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">
                        {b.equipoTexto}
                        <span className={`hist-status ${b.pdfDisponible ? "ok" : "gone"}`}>
                          {b.pdfDisponible ? "PDF disponible" : "Solo registro"}
                        </span>
                        {entregadoAt && (
                          <span className="hist-status ok" title={`Confirmado ${fmtFechaHora(entregadoAt)}`}>
                            Entregado a depósito
                          </span>
                        )}
                      </div>
                      <div className="hist-meta">
                        {b.numeroGeneracion} · {TIPO_EQUIPO_BAJA_LABEL[b.tipoEquipo]} ({b.equipoCategoria}) · {MOTIVO_BAJA_LABEL[b.motivo]} ·{" "}
                        {b.ubicacionLabel} · {fmtFecha(b.fecha)}
                      </div>
                      {b.comentario && <div className="hist-meta" style={{ marginTop: 4 }}>{b.comentario}</div>}
                    </div>
                  </div>
                  <div className="hist-actions">
                    {!entregadoAt && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === b.id}
                        onClick={() => confirmarEntrega(b.id)}
                      >
                        {busyId === b.id ? "…" : "Confirmar entrega a depósito"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      title={b.pdfDisponible ? "Ver comprobante" : "Sin comprobante disponible"}
                      disabled={!b.pdfDisponible || busyId === b.id}
                      onClick={() => verComprobante(b.id)}
                    >
                      {busyId === b.id ? "…" : <Icon name="eye" size={15} />}
                    </button>
                    {esAdmin && (
                      <button type="button" className="icon-btn" title="Editar baja" disabled={busyId === b.id} onClick={() => setEditando(b)}>
                        <Icon name="edit" size={15} />
                      </button>
                    )}
                    {esAdmin && (
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Borrar baja"
                        disabled={busyId === b.id}
                        onClick={() => eliminar(b.id, b.equipoTexto)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editando && (
        <EditarBajaModal
          baja={editando}
          onClose={() => setEditando(null)}
          onGuardado={(actualizada) => {
            setBajas((prev) => prev.map((b) => (b.id === actualizada.id ? { ...b, ...actualizada } : b)));
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function EditarBajaModal({
  baja,
  onClose,
  onGuardado,
}: {
  baja: HistorialBajaRow;
  onClose: () => void;
  onGuardado: (actualizada: { id: string; motivo: MotivoBaja; fecha: string; comentario: string | null }) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoBaja>(baja.motivo);
  const [fecha, setFecha] = useState(baja.fecha);
  const [comentario, setComentario] = useState(baja.comentario ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setBusy(true);
    setError(null);
    const res = await actualizarBajaAction(baja.id, { motivo, fecha, comentario });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo actualizar la baja.");
      return;
    }
    onGuardado({ id: baja.id, motivo, fecha, comentario: comentario.trim() || null });
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-label" style={{ marginBottom: 4 }}>
          Editar baja
        </div>
        <p className="hint" style={{ margin: "0 0 14px" }}>
          {baja.equipoTexto} — el equipo en sí no se puede cambiar acá, solo motivo/fecha/comentario.
        </p>

        <div className="field">
          <label>Motivo</label>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoBaja)} disabled={busy}>
            {MOTIVO_BAJA_OPCIONES.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_BAJA_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>
            Comentario <span className="opt">(opcional)</span>
          </label>
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} disabled={busy} rows={2} />
        </div>

        {error && <div className="error-text">{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={guardar} disabled={busy}>
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
