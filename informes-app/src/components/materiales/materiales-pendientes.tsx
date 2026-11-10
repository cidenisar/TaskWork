"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buscarMaterialesPendientesAction,
  devolverMaterialPendienteADepositoAction,
  type MaterialPendiente,
} from "@/app/panel/materiales/alta-actions";
import { CATEGORIA_EQUIPO_LABEL } from "@/components/equipos/types";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/spinner";

function fmtFecha(fecha: string | null): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

/**
 * Lo que uno mismo dio de alta (ver alta-material-form.tsx) y todavía no
 * adjuntó a ningún Informe Técnico — con la salida de emergencia que pidió
 * Ivan: "si tenemos que devolver algo, ese material se puede usar y marcar
 * lo que se devuelve al depósito" (autocorrección de una alta que al final
 * no se instaló).
 */
export function MaterialesPendientes() {
  const router = useRouter();
  const [pendientes, setPendientes] = useState<MaterialPendiente[] | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    buscarMaterialesPendientesAction().then(setPendientes);
  }, []);

  async function devolver(id: string) {
    setBusyId(id);
    setError(null);
    const res = await devolverMaterialPendienteADepositoAction(id);
    setBusyId(null);
    setConfirmandoId(null);
    if (!res.success) {
      setError(res.error || "No se pudo devolver el material.");
      return;
    }
    setPendientes((prev) => (prev ?? []).filter((p) => p.id !== id));
    router.refresh();
  }

  if (pendientes === null) {
    return <div className="empty-note">Cargando...</div>;
  }
  if (pendientes.length === 0) {
    return <div className="empty-note">No tenés materiales dados de alta pendientes de adjuntar a un informe.</div>;
  }

  return (
    <div className="card">
      <div className="section-label">Pendientes de adjuntar a un informe ({pendientes.length})</div>
      <p className="hint" style={{ margin: "-4px 0 10px" }}>
        Diste de alta esto y todavía no lo adjuntaste a un Informe Técnico. Si al final no lo instalaste, devolvelo a depósito.
      </p>
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="list-grid">
        {pendientes.map((p) => (
          <div className="hist-item" key={p.id}>
            <div className="info">
              <div className="hist-main">
                <div className="hist-title">{p.descripcion}</div>
                <div className="hist-meta">
                  {CATEGORIA_EQUIPO_LABEL[p.categoriaEquipo]}
                  {p.marcaModelo ? ` · ${p.marcaModelo}` : ""}
                  {p.numeroSerie ? ` · N° serie ${p.numeroSerie}` : ""}
                  {p.etiquetaYpf ? ` · Etiqueta YPF ${p.etiquetaYpf}` : ""}
                </div>
                <div className="hist-meta">
                  {p.ubicacionLabel} · dado de alta el {fmtFecha(p.fechaAlta)}
                </div>
              </div>
            </div>
            <div className="hist-actions">
              <button type="button" className="icon-btn" title="Devolver a depósito" onClick={() => setConfirmandoId(p.id)} disabled={busyId === p.id}>
                {busyId === p.id ? <Spinner size={15} /> : <Icon name="truck" size={15} />}
              </button>
            </div>
            {confirmandoId === p.id && (
              <div className="modal-overlay" onClick={() => setConfirmandoId(null)}>
                <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                  <div className="section-label" style={{ marginBottom: 4 }}>
                    Devolver a depósito
                  </div>
                  <p className="hint" style={{ margin: "0 0 14px" }}>
                    {p.descripcion} — se marca como devuelto, sin instalar.
                  </p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmandoId(null)} disabled={busyId === p.id}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => devolver(p.id)} disabled={busyId === p.id}>
                      {busyId === p.id ? "Devolviendo..." : "Confirmar devolución"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
