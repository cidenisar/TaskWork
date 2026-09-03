"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoRendicion, Moneda } from "@/lib/database.types";
import { agregarGastoAction, cerrarRendicionAction, eliminarGastoAction } from "@/app/(app)/rendicion-gastos/[id]/actions";
import type { CatalogosRendicion, GastoTecnicoChip } from "./types";
import { ErrorNote } from "@/components/notes";
import { Icon } from "@/components/icon";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}
function fmtMonto(monto: number, moneda: string) {
  return `${moneda} ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface GastoWorkspaceItem {
  id: string;
  fecha: string;
  categoria: string;
  monto: number;
  descripcion: string | null;
  comprobanteUrl: string | null;
  tecnicos: { nombre: string; torre: string | null }[];
}

export function RendicionWorkspace({
  rendicionId,
  numeroGeneracion,
  motivo,
  fecha,
  proyectoCliente,
  provincia,
  viaticoRecibido,
  moneda,
  estado,
  pdfUrl,
  gastos,
  catalogos,
}: {
  rendicionId: string;
  numeroGeneracion: string;
  motivo: string;
  fecha: string;
  proyectoCliente: string | null;
  provincia: string | null;
  viaticoRecibido: number;
  moneda: Moneda;
  estado: EstadoRendicion;
  pdfUrl: string | null;
  gastos: GastoWorkspaceItem[];
  catalogos: CatalogosRendicion;
}) {
  const router = useRouter();
  const abierta = estado === "abierta";
  const totalGastado = gastos.reduce((sum, g) => sum + g.monto, 0);
  const saldo = viaticoRecibido - totalGastado;
  const aFavor = saldo >= 0;

  const [cerrando, setCerrando] = useState(false);
  const [cerrarError, setCerrarError] = useState<string | null>(null);
  const [cerrarOk, setCerrarOk] = useState<string | null>(pdfUrl);
  const [busyGastoId, setBusyGastoId] = useState<string | null>(null);

  async function cerrar() {
    if (!window.confirm("¿Cerrar esta rendición y generar el PDF? Después no vas a poder agregar más gastos.")) return;
    setCerrando(true);
    setCerrarError(null);
    const res = await cerrarRendicionAction(rendicionId);
    setCerrando(false);
    if (!res.success) {
      setCerrarError(res.error || "No se pudo cerrar la rendición.");
      return;
    }
    setCerrarOk(res.pdfUrl ?? null);
    router.refresh();
  }

  async function quitarGasto(gastoId: string) {
    setBusyGastoId(gastoId);
    await eliminarGastoAction(rendicionId, gastoId);
    setBusyGastoId(null);
    router.refresh();
  }

  return (
    <div>
      <div className="page-heading">
        <h1>{motivo}</h1>
        <p>
          {numeroGeneracion} · {fmtFecha(fecha)}
          {proyectoCliente ? ` · ${proyectoCliente}` : ""} ·{" "}
          <span className={`hist-status ${abierta ? "warn" : "ok"}`}>{abierta ? "Abierta" : "Cerrada"}</span>
        </p>
      </div>

      <div className="card">
        <div className="saldo-box">
          <div className="label">{aFavor ? "Saldo a favor de la empresa" : "Saldo a favor del empleado (a reintegrar)"}</div>
          <div className={`amount ${aFavor ? "positive" : "negative"}`}>{fmtMonto(Math.abs(saldo), moneda)}</div>
        </div>
        <table className="review-table" style={{ marginTop: 14 }}>
          <tbody>
            <tr>
              <td className="k">Viático Recibido</td>
              <td className="v">{fmtMonto(viaticoRecibido, moneda)}</td>
            </tr>
            <tr>
              <td className="k">Total Gastado</td>
              <td className="v">{fmtMonto(totalGastado, moneda)}</td>
            </tr>
            <tr>
              <td className="k">Cantidad de Gastos</td>
              <td className="v">{gastos.length}</td>
            </tr>
            {provincia && (
              <tr>
                <td className="k">Provincia</td>
                <td className="v">{provincia}</td>
              </tr>
            )}
          </tbody>
        </table>

        {abierta ? (
          <>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={cerrar} disabled={cerrando}>
                {cerrando ? (
                  "Cerrando..."
                ) : (
                  <>
                    <Icon name="lock" size={14} /> Cerrar rendición y generar PDF
                  </>
                )}
              </button>
              <a
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: "center" }}
                href={`/api/rendiciones/${rendicionId}/excel`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="chart" size={14} /> Exportar Excel (parcial)
              </a>
            </div>
            {cerrarError && <ErrorNote>{cerrarError}</ErrorNote>}
          </>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            {cerrarOk && (
              <a className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} href={cerrarOk} target="_blank" rel="noreferrer">
                <Icon name="document" size={14} /> Ver PDF
              </a>
            )}
            <a
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: "center" }}
              href={`/api/rendiciones/${rendicionId}/excel`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="chart" size={14} /> Exportar Excel
            </a>
          </div>
        )}
      </div>

      {abierta && <AgregarGastoForm rendicionId={rendicionId} catalogos={catalogos} onAdded={() => router.refresh()} />}

      <div className="card">
        <div className="review-block-title">Gastos cargados</div>
        {gastos.length === 0 ? (
          <div className="empty-note">Todavía no cargaste gastos.</div>
        ) : (
          <div className="item-list" style={{ marginTop: 0 }}>
            {gastos.map((g) => (
              <div className="list-item" key={g.id}>
                <div className="info">
                  {g.comprobanteUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura desde URL firmada de Storage
                    <img className="gasto-thumb" src={g.comprobanteUrl} alt="" />
                  ) : (
                    <div className="avatar">$</div>
                  )}
                  <div>
                    <div className="item-name">
                      {g.categoria} — {fmtMonto(g.monto, moneda)}
                    </div>
                    <div className="item-sub">
                      {fmtFecha(g.fecha)} {g.descripcion ? `· ${g.descripcion}` : ""}
                      {g.tecnicos.length ? ` · ${g.tecnicos.map((t) => t.nombre).join(", ")}` : ""}
                    </div>
                  </div>
                </div>
                {abierta && (
                  <button type="button" className="remove-btn" disabled={busyGastoId === g.id} onClick={() => quitarGasto(g.id)}>
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgregarGastoForm({
  rendicionId,
  catalogos,
  onAdded,
}: {
  rendicionId: string;
  catalogos: CatalogosRendicion;
  onAdded: () => void;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState("");
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState<string | null>(null);
  const [tecNombre, setTecNombre] = useState("");
  const [tecTorre, setTecTorre] = useState("");
  const [chips, setChips] = useState<GastoTecnicoChip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function setComprobanteFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setComprobante(file);
    setComprobantePreview(URL.createObjectURL(file));
  }
  function addChip() {
    if (!tecNombre.trim()) return;
    setChips([...chips, { nombre: tecNombre.trim(), torre: tecTorre.trim() }]);
    setTecNombre("");
    setTecTorre("");
  }
  function removeChip(i: number) {
    setChips(chips.filter((_, idx) => idx !== i));
  }

  async function agregar() {
    const categoriaFinal = categoria === "__new" ? categoriaNueva.trim() : categoria;
    const montoNum = Number(monto.replace(",", "."));
    if (!categoriaFinal || !Number.isFinite(montoNum) || montoNum <= 0) {
      setError("Completá categoría y un monto válido.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("fecha", fecha);
    fd.set("categoria", categoriaFinal);
    fd.set("monto", monto);
    fd.set("descripcion", descripcion);
    fd.set("tecnicos", JSON.stringify(chips));
    if (comprobante) fd.set("comprobante", comprobante);

    const res = await agregarGastoAction(rendicionId, fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar el gasto.");
      return;
    }
    setCategoria("");
    setCategoriaNueva("");
    setMonto("");
    setDescripcion("");
    setComprobante(null);
    setComprobantePreview(null);
    setChips([]);
    onAdded();
  }

  return (
    <div className="card">
      <div className="section-label">Agregar Gasto</div>
      <div className="grid2">
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>Categoría</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy}>
            <option value="">Seleccionar categoría...</option>
            {catalogos.categoriasGasto.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__new">+ Agregar nueva categoría...</option>
          </select>
          {categoria === "__new" && (
            <input
              type="text"
              placeholder="Nombre de la nueva categoría"
              value={categoriaNueva}
              onChange={(e) => setCategoriaNueva(e.target.value)}
              disabled={busy}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Monto</label>
          <input type="text" inputMode="decimal" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>
            Comprobante <span className="opt">(foto, opcional)</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <Icon name="upload" size={13} /> Subir
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => cameraInputRef.current?.click()} disabled={busy}>
              <Icon name="camera" size={13} /> Cámara
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setComprobanteFile(e.target.files)} />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => setComprobanteFile(e.target.files)}
          />
          {comprobantePreview && (
            <div className="hint">
              Comprobante adjuntado <Icon name="check" size={12} />
            </div>
          )}
        </div>
      </div>
      <div className="field">
        <label>
          Descripción <span className="opt">(opcional)</span>
        </label>
        <input type="text" placeholder="Ej: Almuerzo equipo de trabajo" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={busy} />
      </div>

      <div className="field">
        <label>
          Técnicos de este gasto <span className="opt">(uno o varios)</span>
        </label>
        <div className="tech-form-grid" style={{ marginBottom: 10 }}>
          <input
            type="text"
            list="rg-tech-catalog-list"
            placeholder="Nombre completo"
            value={tecNombre}
            onChange={(e) => setTecNombre(e.target.value)}
            disabled={busy}
          />
          <input
            type="text"
            list="rg-torre-catalog-list"
            placeholder="Torre"
            value={tecTorre}
            onChange={(e) => setTecTorre(e.target.value)}
            disabled={busy}
          />
        </div>
        <datalist id="rg-tech-catalog-list">
          {catalogos.tecnicos.map((t) => (
            <option key={t.nombre} value={t.nombre} />
          ))}
        </datalist>
        <datalist id="rg-torre-catalog-list">
          {catalogos.torres.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addChip} disabled={busy}>
          + Agregar técnico a este gasto
        </button>
        <div className="chip-row">
          {chips.map((c, i) => (
            <span className="chip" key={`${c.nombre}-${i}`}>
              {c.nombre}
              {c.torre ? ` — ${c.torre}` : ""}
              <button type="button" onClick={() => removeChip(i)} disabled={busy}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={agregar} disabled={busy}>
        {busy ? "Guardando..." : "+ Agregar Gasto"}
      </button>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
