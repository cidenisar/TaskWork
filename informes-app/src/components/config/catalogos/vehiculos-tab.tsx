"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { addVehiculoAction, removeVehiculoAction, actualizarKilometrajeAction } from "@/app/(app)/configuracion/actions/vehiculos";
import { estadoVencimiento } from "@/lib/config/fleet-alerts";

export interface VehiculoItem {
  id: string;
  patente: string;
  marcaModelo: string | null;
  vencimientoTarjetaVerde: string | null;
  vencimientoRto: string | null;
  kilometrajeActual: number | null;
}

const BADGE_LABEL: Record<"ok" | "warn" | "danger", string> = { ok: "Al día", warn: "Próximo a vencer", danger: "Vencido" };
const BADGE_ICON: Record<"ok" | "warn" | "danger", string> = { ok: "🟢", warn: "🟡", danger: "🔴" };

function VencBadge({ label, fecha }: { label: string; fecha: string | null }) {
  const estado = estadoVencimiento(fecha);
  if (!estado) return <span className="venc-badge">{label}: sin cargar</span>;
  return (
    <span className={`venc-badge ${estado}`}>
      {BADGE_ICON[estado]} {label}: {BADGE_LABEL[estado]}
    </span>
  );
}

export function VehiculosTab({
  vehiculos,
  setVehiculos,
}: {
  vehiculos: VehiculoItem[];
  setVehiculos: Dispatch<SetStateAction<VehiculoItem[]>>;
}) {
  const [patente, setPatente] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [vencTarjeta, setVencTarjeta] = useState("");
  const [vencRto, setVencRto] = useState("");
  const [km, setKm] = useState("");
  const [tarjetaFoto, setTarjetaFoto] = useState<File | null>(null);
  const [rtoFoto, setRtoFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kmEdit, setKmEdit] = useState<Record<string, string>>({});

  const tarjetaInputRef = useRef<HTMLInputElement>(null);
  const rtoInputRef = useRef<HTMLInputElement>(null);

  async function add() {
    if (!patente.trim()) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append(
      "payload",
      JSON.stringify({ patente, marcaModelo, vencimientoTarjetaVerde: vencTarjeta, vencimientoRto: vencRto, kilometrajeActual: km }),
    );
    if (tarjetaFoto) fd.append("tarjetaFoto", tarjetaFoto);
    if (rtoFoto) fd.append("rtoFoto", rtoFoto);

    const res = await addVehiculoAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar el vehículo.");
      return;
    }
    setVehiculos((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        patente: patente.trim(),
        marcaModelo: marcaModelo.trim() || null,
        vencimientoTarjetaVerde: vencTarjeta || null,
        vencimientoRto: vencRto || null,
        kilometrajeActual: km ? Number(km) : null,
      },
    ]);
    setPatente("");
    setMarcaModelo("");
    setVencTarjeta("");
    setVencRto("");
    setKm("");
    setTarjetaFoto(null);
    setRtoFoto(null);
  }

  async function remove(v: VehiculoItem) {
    setBusy(true);
    const res = await removeVehiculoAction(v.id, v.patente);
    setBusy(false);
    if (res.success) setVehiculos((prev) => prev.filter((i) => i.id !== v.id));
  }

  async function guardarKm(v: VehiculoItem) {
    const valor = kmEdit[v.id];
    if (valor == null || valor === "") return;
    setBusy(true);
    const res = await actualizarKilometrajeAction(v.id, v.patente, valor);
    setBusy(false);
    if (res.success) {
      setVehiculos((prev) => prev.map((i) => (i.id === v.id ? { ...i, kilometrajeActual: Number(valor) } : i)));
      setKmEdit((prev) => ({ ...prev, [v.id]: "" }));
    }
  }

  return (
    <div>
      <div className="tech-form-grid">
        <input type="text" placeholder="Patente" value={patente} onChange={(e) => setPatente(e.target.value)} disabled={busy} />
        <input type="text" placeholder="Marca / Modelo" value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} disabled={busy} />
      </div>
      <div className="tech-form-grid">
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Vencimiento Tarjeta Verde</label>
          <input type="date" value={vencTarjeta} onChange={(e) => setVencTarjeta(e.target.value)} disabled={busy} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Vencimiento RTO</label>
          <input type="date" value={vencRto} onChange={(e) => setVencRto(e.target.value)} disabled={busy} />
        </div>
      </div>
      <div className="tech-form-grid">
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Kilometraje actual</label>
          <input type="text" inputMode="numeric" placeholder="Ej: 84.500" value={km} onChange={(e) => setKm(e.target.value)} disabled={busy} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>
            Fotos <span className="opt">(tarjeta verde / RTO)</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => tarjetaInputRef.current?.click()} disabled={busy}>
              📄 T. Verde{tarjetaFoto ? " ✓" : ""}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => rtoInputRef.current?.click()} disabled={busy}>
              📄 RTO{rtoFoto ? " ✓" : ""}
            </button>
          </div>
          <input ref={tarjetaInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setTarjetaFoto(e.target.files?.[0] ?? null)} />
          <input ref={rtoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setRtoFoto(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={busy}>
        + Agregar al catálogo
      </button>
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}

      <div className="item-list">
        {vehiculos.length === 0 ? (
          <div className="empty-note">Todavía no hay vehículos en el catálogo.</div>
        ) : (
          vehiculos.map((v) => (
            <div className="list-item" key={v.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <div className="info">
                  <div className="avatar">🚐</div>
                  <div>
                    <div className="item-name">{v.patente}</div>
                    <div className="item-sub">{v.marcaModelo || "Sin marca/modelo"}</div>
                  </div>
                </div>
                <button type="button" className="remove-btn" onClick={() => remove(v)} disabled={busy}>
                  ✕
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <VencBadge label="Tarjeta Verde" fecha={v.vencimientoTarjetaVerde} />
                <VencBadge label="RTO" fecha={v.vencimientoRto} />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="item-sub">Km actual: {v.kilometrajeActual != null ? v.kilometrajeActual.toLocaleString("es-AR") : "—"}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Actualizar km"
                  style={{ maxWidth: 130, padding: "6px 10px", fontSize: 12 }}
                  value={kmEdit[v.id] ?? ""}
                  onChange={(e) => setKmEdit((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  disabled={busy}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => guardarKm(v)} disabled={busy}>
                  Guardar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
