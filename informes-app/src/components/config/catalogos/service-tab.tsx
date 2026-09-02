"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { addServiceAction } from "@/app/(app)/configuracion/actions/vehiculos";

export interface ServiceItem {
  id: string;
  vehiculoId: string;
  patente: string;
  fecha: string;
  kilometraje: number;
  descripcion: string | null;
}

export function ServiceTab({
  services,
  setServices,
  vehiculos,
}: {
  services: ServiceItem[];
  setServices: Dispatch<SetStateAction<ServiceItem[]>>;
  vehiculos: { id: string; patente: string }[];
}) {
  const [vehiculoId, setVehiculoId] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [km, setKm] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  async function add() {
    if (!vehiculoId || !fecha || !km.trim()) {
      setError("Completá vehículo, fecha y kilometraje.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("payload", JSON.stringify({ vehiculoId, fecha, kilometraje: km, descripcion }));
    if (foto) fd.append("foto", foto);

    const res = await addServiceAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo registrar el service.");
      return;
    }
    const patente = vehiculos.find((v) => v.id === vehiculoId)?.patente ?? "";
    setServices((prev) => [
      { id: crypto.randomUUID(), vehiculoId, patente, fecha, kilometraje: Number(km), descripcion: descripcion.trim() || null },
      ...prev,
    ]);
    setVehiculoId("");
    setKm("");
    setDescripcion("");
    setFoto(null);
  }

  return (
    <div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Registrá cada service para llevar el historial por vehículo.
      </div>
      <div className="tech-form-grid">
        <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} disabled={busy}>
          <option value="">Seleccionar vehículo...</option>
          {vehiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.patente}
            </option>
          ))}
        </select>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
      </div>
      <div className="tech-form-grid">
        <input type="text" inputMode="numeric" placeholder="Kilometraje del service" value={km} onChange={(e) => setKm(e.target.value)} disabled={busy} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fotoInputRef.current?.click()} disabled={busy}>
            📷 Foto{foto ? " ✓" : ""}
          </button>
          <input ref={fotoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <div className="field">
        <label>
          Descripción <span className="opt">(opcional)</span>
        </label>
        <input type="text" placeholder="Ej: Cambio de aceite y filtros" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={busy} />
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={busy}>
        + Registrar Service
      </button>
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}

      <div className="item-list">
        {services.length === 0 ? (
          <div className="empty-note">Todavía no hay services registrados.</div>
        ) : (
          services.map((s) => (
            <div className="list-item" key={s.id}>
              <div className="info">
                <div className="avatar">🔧</div>
                <div>
                  <div className="item-name">{s.patente}</div>
                  <div className="item-sub">
                    {s.fecha} · {s.kilometraje.toLocaleString("es-AR")} km{s.descripcion ? ` · ${s.descripcion}` : ""}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
