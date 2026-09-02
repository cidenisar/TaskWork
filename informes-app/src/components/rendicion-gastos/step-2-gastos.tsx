"use client";

import { useRef, useState } from "react";
import type { CatalogosRendicion, GastoItem, GastoTecnicoChip } from "./types";

function fmtMonto(monto: number) {
  return monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function Step2Gastos({
  gastos,
  setGastos,
  catalogos,
}: {
  gastos: GastoItem[];
  setGastos: (g: GastoItem[]) => void;
  catalogos: CatalogosRendicion;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState("");
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [comprobanteBlob, setComprobanteBlob] = useState<Blob | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState<string | null>(null);
  const [tecNombre, setTecNombre] = useState("");
  const [tecTorre, setTecTorre] = useState("");
  const [chips, setChips] = useState<GastoTecnicoChip[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function setComprobante(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setComprobanteBlob(file);
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

  function addGasto() {
    const montoNum = Number(monto.replace(",", "."));
    if (!categoria || (categoria === "__new" && !categoriaNueva.trim())) return;
    if (!montoNum || montoNum <= 0) return;

    setGastos([
      ...gastos,
      {
        clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fecha,
        categoria: categoria === "__new" ? categoriaNueva.trim() : categoria,
        monto: montoNum,
        descripcion: descripcion.trim(),
        tecnicos: chips,
        comprobanteBlob,
        comprobantePreviewUrl: comprobantePreview,
      },
    ]);

    setCategoria("");
    setCategoriaNueva("");
    setMonto("");
    setDescripcion("");
    setComprobanteBlob(null);
    setComprobantePreview(null);
    setChips([]);
  }
  function removeGasto(clientId: string) {
    setGastos(gastos.filter((g) => g.clientId !== clientId));
  }

  return (
    <div className="card">
      <div className="section-label">Agregar Gasto</div>
      <div className="grid2">
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="field">
          <label>Categoría</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
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
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Monto</label>
          <input type="text" inputMode="decimal" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </div>
        <div className="field">
          <label>
            Comprobante <span className="opt">(foto, opcional)</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
              ↑ Subir
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => cameraInputRef.current?.click()}>
              📷 Cámara
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => setComprobante(e.target.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => setComprobante(e.target.files)}
          />
          {comprobantePreview && <div className="hint">Comprobante adjuntado ✓</div>}
        </div>
      </div>
      <div className="field">
        <label>
          Descripción <span className="opt">(opcional)</span>
        </label>
        <input
          type="text"
          placeholder="Ej: Almuerzo equipo de trabajo"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
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
          />
          <input
            type="text"
            list="rg-torre-catalog-list"
            placeholder="Torre"
            value={tecTorre}
            onChange={(e) => setTecTorre(e.target.value)}
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
        <button type="button" className="btn btn-secondary btn-sm" onClick={addChip}>
          + Agregar técnico a este gasto
        </button>
        <div className="chip-row">
          {chips.map((c, i) => (
            <span className="chip" key={`${c.nombre}-${i}`}>
              {c.nombre}
              {c.torre ? ` — ${c.torre}` : ""}
              <button type="button" onClick={() => removeChip(i)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={addGasto}>
        + Agregar Gasto
      </button>

      <div className="item-list">
        {gastos.length === 0 ? (
          <div className="empty-note">Todavía no agregaste gastos.</div>
        ) : (
          gastos.map((g) => (
            <div className="list-item" key={g.clientId}>
              <div className="info">
                {g.comprobantePreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura desde blob: URL generada en el cliente
                  <img className="gasto-thumb" src={g.comprobantePreviewUrl} alt="" />
                ) : (
                  <div className="avatar">$</div>
                )}
                <div>
                  <div className="item-name">
                    {g.categoria} — ${fmtMonto(g.monto)}
                  </div>
                  <div className="item-sub">
                    {g.fecha} {g.descripcion ? `· ${g.descripcion}` : ""}
                    {g.tecnicos.length ? ` · ${g.tecnicos.map((t) => t.nombre).join(", ")}` : ""}
                  </div>
                </div>
              </div>
              <button type="button" className="remove-btn" onClick={() => removeGasto(g.clientId)}>
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
