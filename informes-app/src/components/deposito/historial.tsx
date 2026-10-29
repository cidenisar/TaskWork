"use client";

import { useMemo, useState } from "react";
import {
  obtenerUrlPdfEntregaAction,
  obtenerUrlsFotosEvidenciaEntregaAction,
  eliminarEntregaAction,
  actualizarEntregaAction,
  type ActualizarEntregaPayload,
} from "@/app/(app)/entregas-deposito/historial/actions";
import { Icon } from "@/components/icon";
import { MOTIVO_ENTREGA_OPCIONES, MOTIVO_ENTREGA_LABEL, CONDICION_OPCIONES, CONDICION_LABEL, TIPO_EQUIPO_LABEL } from "./types";
import type { CondicionMaterial, MotivoEntregaDeposito, OrigenEntregaDeposito, TipoEquipoBaja } from "@/lib/database.types";

export interface HistorialEntregaRow {
  id: string;
  numeroGeneracion: string;
  origen: OrigenEntregaDeposito;
  tipoEquipo: TipoEquipoBaja | null;
  descripcion: string;
  categoria: string | null;
  marcaModelo: string | null;
  numeroSerie: string | null;
  etiquetaYpf: string | null;
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

export function HistorialEntregas({ entregas: entregasIniciales, esAdmin }: { entregas: HistorialEntregaRow[]; esAdmin: boolean }) {
  const [entregas, setEntregas] = useState(entregasIniciales);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editando, setEditando] = useState<HistorialEntregaRow | null>(null);

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

  async function eliminar(id: string, descripcion: string) {
    if (!window.confirm(`¿Borrar definitivamente la entrega de "${descripcion}"? Esto no se puede deshacer.`)) return;
    setBusyId(id);
    setNotice(null);
    const res = await eliminarEntregaAction(id);
    setBusyId(null);
    if (!res.success) {
      setNotice(res.error || "No se pudo borrar la entrega.");
      return;
    }
    setEntregas((prev) => prev.filter((e) => e.id !== id));
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
                  {esAdmin && (
                    <button type="button" className="icon-btn" title="Editar entrega" disabled={busyId === e.id} onClick={() => setEditando(e)}>
                      <Icon name="edit" size={15} />
                    </button>
                  )}
                  {esAdmin && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      title="Borrar entrega"
                      disabled={busyId === e.id}
                      onClick={() => eliminar(e.id, e.descripcion)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editando && (
        <EditarEntregaModal
          entrega={editando}
          onClose={() => setEditando(null)}
          onGuardado={(payload) => {
            setEntregas((prev) =>
              prev.map((e) =>
                e.id === editando.id
                  ? { ...e, ...payload, categoria: payload.categoria || null, marcaModelo: payload.marcaModelo || null, numeroSerie: payload.numeroSerie || null, etiquetaYpf: payload.etiquetaYpf || null, comentario: payload.comentario || null }
                  : e,
              ),
            );
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function EditarEntregaModal({
  entrega,
  onClose,
  onGuardado,
}: {
  entrega: HistorialEntregaRow;
  onClose: () => void;
  onGuardado: (payload: ActualizarEntregaPayload) => void;
}) {
  const [descripcion, setDescripcion] = useState(entrega.descripcion);
  const [categoria, setCategoria] = useState(entrega.categoria ?? "");
  const [marcaModelo, setMarcaModelo] = useState(entrega.marcaModelo ?? "");
  const [numeroSerie, setNumeroSerie] = useState(entrega.numeroSerie ?? "");
  const [etiquetaYpf, setEtiquetaYpf] = useState(entrega.etiquetaYpf ?? "");
  const [cantidad, setCantidad] = useState(String(entrega.cantidad));
  const [condicion, setCondicion] = useState<CondicionMaterial>(entrega.condicion);
  const [motivo, setMotivo] = useState<MotivoEntregaDeposito>(entrega.motivo);
  const [comentario, setComentario] = useState(entrega.comentario ?? "");
  const [fecha, setFecha] = useState(entrega.fecha);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const payload: ActualizarEntregaPayload = {
      descripcion,
      categoria,
      marcaModelo,
      numeroSerie,
      etiquetaYpf,
      cantidad: Number(cantidad) || 1,
      condicion,
      motivo,
      comentario,
      fecha,
    };
    setBusy(true);
    setError(null);
    const res = await actualizarEntregaAction(entrega.id, payload);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo actualizar la entrega.");
      return;
    }
    onGuardado(payload);
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-label" style={{ marginBottom: 4 }}>
          Editar entrega
        </div>
        {entrega.numeroGeneracion && (
          <p className="hint" style={{ margin: "0 0 14px" }}>
            {entrega.numeroGeneracion} — si este material comparte comprobante con otros de la misma carga, el PDF se regenera con todos.
          </p>
        )}

        <div className="field">
          <label>Descripción</label>
          <input type="text" value={descripcion} onChange={(ev) => setDescripcion(ev.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>
            Categoría <span className="opt">(opcional)</span>
          </label>
          <input type="text" value={categoria} onChange={(ev) => setCategoria(ev.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>
            Marca/Modelo <span className="opt">(opcional)</span>
          </label>
          <input type="text" value={marcaModelo} onChange={(ev) => setMarcaModelo(ev.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>
            N° de serie <span className="opt">(opcional)</span>
          </label>
          <input type="text" value={numeroSerie} onChange={(ev) => setNumeroSerie(ev.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>
            Etiqueta YPF <span className="opt">(opcional)</span>
          </label>
          <input type="text" value={etiquetaYpf} onChange={(ev) => setEtiquetaYpf(ev.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>Cantidad</label>
          <input type="number" min={1} value={cantidad} onChange={(ev) => setCantidad(ev.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>Condición</label>
          <select value={condicion} onChange={(ev) => setCondicion(ev.target.value as CondicionMaterial)} disabled={busy}>
            {CONDICION_OPCIONES.map((c) => (
              <option key={c} value={c}>
                {CONDICION_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Motivo</label>
          <select value={motivo} onChange={(ev) => setMotivo(ev.target.value as MotivoEntregaDeposito)} disabled={busy}>
            {MOTIVO_ENTREGA_OPCIONES.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_ENTREGA_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>
            Comentario <span className="opt">(opcional)</span>
          </label>
          <textarea value={comentario} onChange={(ev) => setComentario(ev.target.value)} disabled={busy} rows={2} />
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
