"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { addServiceAction } from "@/app/(app)/configuracion/actions/vehiculos";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { Icon } from "@/components/icon";
import { VEHICULO_EXTERIOR_FOTO_MAX } from "./alta-types";

export interface ServiceItem {
  id: string;
  vehiculoId: string;
  patente: string;
  fecha: string;
  kilometraje: number;
  descripcion: string | null;
  inconsistenciasDetectadas?: string | null;
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

  // Control periódico (opcional): fotos del exterior + comparación con IA
  // contra el último estado conocido del vehículo — ver /api/vehiculos/comparar-estado.
  const [fotosControl, setFotosControl] = useState<File[]>([]);
  const [leyendoControl, setLeyendoControl] = useState(false);
  const [notaControl, setNotaControl] = useState<string | null>(null);
  const [estadoGeneral, setEstadoGeneral] = useState("");
  const [tieneDanios, setTieneDanios] = useState<boolean | null>(null);
  const [inconsistencias, setInconsistencias] = useState("");
  const controlCameraRef = useRef<HTMLInputElement>(null);
  const controlGaleriaRef = useRef<HTMLInputElement>(null);

  function agregarFotosControl(files: File[]) {
    if (files.length === 0) return;
    setNotaControl(null);
    setFotosControl((prev) => {
      const disponibles = VEHICULO_EXTERIOR_FOTO_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  async function compararConIa() {
    if (!vehiculoId) {
      setNotaControl("Elegí primero el vehículo.");
      return;
    }
    if (fotosControl.length === 0) return;
    setLeyendoControl(true);
    setNotaControl(null);
    try {
      const fd = new FormData();
      fd.append("vehiculoId", vehiculoId);
      for (const f of fotosControl) {
        const jpeg = await resizeImageToJpeg(f);
        fd.append("fotos", jpeg, "control.jpg");
      }
      const res = await fetch("/api/vehiculos/comparar-estado", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setNotaControl(data.error || "No se pudo leer las fotos.");
        return;
      }
      if (data.estadoGeneral) setEstadoGeneral(data.estadoGeneral);
      if (data.tieneDanios != null) setTieneDanios(data.tieneDanios);
      setInconsistencias(data.inconsistenciasDetectadas || "");
      setNotaControl(
        data.tieneReferencia
          ? data.inconsistenciasDetectadas
            ? "⚠ La IA encontró algo distinto respecto del control anterior — revisá abajo antes de guardar."
            : "Listo — sin diferencias respecto del control anterior. Revisá el estado antes de guardar."
          : "Listo — es el primer control con fotos de este vehículo, no hay nada contra qué comparar todavía.",
      );
    } catch (err) {
      setNotaControl("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error comparando estado de vehículo con IA", "comparar-estado-vehiculo");
    } finally {
      setLeyendoControl(false);
    }
  }

  async function add() {
    if (!vehiculoId || !fecha || !km.trim()) {
      setError("Completá vehículo, fecha y kilometraje.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append(
      "payload",
      JSON.stringify({
        vehiculoId,
        fecha,
        kilometraje: km,
        descripcion,
        estadoGeneral,
        tieneDanios,
        inconsistenciasDetectadas: inconsistencias.trim() || null,
      }),
    );
    if (foto) fd.append("foto", foto);
    for (const f of fotosControl) {
      try {
        fd.append("fotosExterior", await resizeImageToJpeg(f), "control.jpg");
      } catch {
        // una foto de control que no se pudo procesar no debe bloquear el guardado del service
      }
    }

    const res = await addServiceAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo registrar el service.");
      return;
    }
    const patente = vehiculos.find((v) => v.id === vehiculoId)?.patente ?? "";
    setServices((prev) => [
      {
        id: crypto.randomUUID(),
        vehiculoId,
        patente,
        fecha,
        kilometraje: Number(km),
        descripcion: descripcion.trim() || null,
        inconsistenciasDetectadas: inconsistencias.trim() || null,
      },
      ...prev,
    ]);
    setVehiculoId("");
    setKm("");
    setDescripcion("");
    setFoto(null);
    setFotosControl([]);
    setEstadoGeneral("");
    setTieneDanios(null);
    setInconsistencias("");
    setNotaControl(null);
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
            <Icon name="camera" size={13} /> Foto{foto ? <Icon name="check" size={12} style={{ marginLeft: 4 }} /> : ""}
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

      <div className="field" style={{ borderTop: "1px solid var(--field-border)", paddingTop: 10, marginTop: 4 }}>
        <label>
          Control periódico del estado <span className="opt">(opcional)</span>
        </label>
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="ai" size={12} /> Si vas a controlar el vehículo (no solo un trabajo puntual), sacale fotos del exterior — la IA
          las compara contra el último control y avisa si hay algo nuevo (daños, roturas).
        </div>
        <input
          ref={controlCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotosControl(files);
          }}
        />
        <input
          ref={controlGaleriaRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotosControl(files);
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: fotosControl.length ? 8 : 0 }}>
          <button
            type="button"
            className="ai-btn"
            onClick={() => controlCameraRef.current?.click()}
            disabled={busy || leyendoControl || fotosControl.length >= VEHICULO_EXTERIOR_FOTO_MAX}
          >
            <Icon name="camera" size={13} /> Sacar fotos ({fotosControl.length}/{VEHICULO_EXTERIOR_FOTO_MAX})
          </button>
          <button
            type="button"
            className="ai-btn"
            onClick={() => controlGaleriaRef.current?.click()}
            disabled={busy || leyendoControl || fotosControl.length >= VEHICULO_EXTERIOR_FOTO_MAX}
          >
            <Icon name="upload" size={13} /> Subir fotos
          </button>
          {fotosControl.length > 0 && (
            <button type="button" className="ai-btn" onClick={() => void compararConIa()} disabled={busy || leyendoControl}>
              <Icon name="ai" size={13} /> {leyendoControl ? "Comparando..." : `Comparar ${fotosControl.length} foto${fotosControl.length === 1 ? "" : "s"} con IA`}
            </button>
          )}
        </div>
        {fotosControl.length > 0 && (
          <div className="chip-row" style={{ marginTop: 0, marginBottom: 8 }}>
            {fotosControl.map((f, i) => (
              <span className="chip" key={i}>
                Foto {i + 1}
                <button
                  type="button"
                  onClick={() => setFotosControl((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={leyendoControl}
                  aria-label={`Quitar foto ${i + 1}`}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {notaControl && <div className="hint">{notaControl}</div>}

        {(estadoGeneral || inconsistencias) && (
          <div style={{ marginTop: 10 }}>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Estado detectado</label>
              <textarea value={estadoGeneral} onChange={(e) => setEstadoGeneral(e.target.value)} disabled={busy} rows={2} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 8 }}>
              <input type="checkbox" checked={tieneDanios === true} onChange={(e) => setTieneDanios(e.target.checked)} disabled={busy} />
              Tiene daños visibles
            </label>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>
                Diferencia respecto del control anterior <span className="opt">(vacío = sin diferencias)</span>
              </label>
              <textarea
                value={inconsistencias}
                onChange={(e) => setInconsistencias(e.target.value)}
                disabled={busy}
                rows={2}
                style={inconsistencias ? { borderColor: "var(--warn)" } : undefined}
              />
            </div>
          </div>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-sm" onClick={() => void add()} disabled={busy} style={{ marginTop: 10 }}>
        {busy ? "Guardando..." : "+ Registrar Service"}
      </button>
      {error && <div className="error-text" style={{ marginTop: 8 }}>{error}</div>}

      <div className="item-list">
        {services.length === 0 ? (
          <div className="empty-note">Todavía no hay services registrados.</div>
        ) : (
          services.map((s) => (
            <div className="list-item" key={s.id}>
              <div className="info">
                <div className="avatar">
                  <Icon name="wrench" size={15} />
                </div>
                <div>
                  <div className="item-name">{s.patente}</div>
                  <div className="item-sub">
                    {s.fecha} · {s.kilometraje.toLocaleString("es-AR")} km{s.descripcion ? ` · ${s.descripcion}` : ""}
                  </div>
                  {s.inconsistenciasDetectadas && (
                    <div className="item-sub" style={{ color: "var(--warn)" }}>
                      <Icon name="warning" size={11} /> {s.inconsistenciasDetectadas}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
