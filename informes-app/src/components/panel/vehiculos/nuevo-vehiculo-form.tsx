"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { altaVehiculoConFotosAction } from "@/app/(app)/configuracion/actions/vehiculos";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { VEHICULO_EXTERIOR_FOTO_MAX, VEHICULO_TABLERO_FOTO_MAX } from "./alta-types";

interface ExteriorLectura {
  patente: string;
  marcaModelo: string;
  estadoGeneral: string;
  tieneDanios: boolean | null;
  identificadoPatente: boolean;
  identificadoMarca: boolean;
}

interface TableroLectura {
  kilometraje: number | null;
  identificado: boolean;
}

/**
 * Alta de vehículo con fotos — mismo sistema de lectura con IA que Racks/
 * Equipos/Torres, pero acá las fotos se mandan en dos lotes separados
 * porque son dos cosas físicamente distintas: fotos del EXTERIOR (patente,
 * marca/modelo, rayones/roturas) y una foto del TABLERO (kilometraje del
 * odómetro). Cada lote tiene su propio botón "Leer con IA" — se puede leer
 * uno sin el otro, y los dos resultados caen en los mismos campos
 * editables de abajo, que son los que realmente se guardan (la IA nunca
 * escribe directo a la base).
 */
export function NuevoVehiculoForm() {
  const router = useRouter();

  const [fotosExterior, setFotosExterior] = useState<File[]>([]);
  const [leyendoExterior, setLeyendoExterior] = useState(false);
  const [notaExterior, setNotaExterior] = useState<string | null>(null);
  /** La primera foto del lote que se leyó con IA — se guarda como evidencia del estado al alta (el resto del lote no se persiste). */
  const [fotoExteriorGuardar, setFotoExteriorGuardar] = useState<File | null>(null);
  const exteriorCameraRef = useRef<HTMLInputElement>(null);
  const exteriorGaleriaRef = useRef<HTMLInputElement>(null);

  const [fotosTablero, setFotosTablero] = useState<File[]>([]);
  const [leyendoTablero, setLeyendoTablero] = useState(false);
  const [notaTablero, setNotaTablero] = useState<string | null>(null);
  const [fotoTableroGuardar, setFotoTableroGuardar] = useState<File | null>(null);
  const tableroCameraRef = useRef<HTMLInputElement>(null);
  const tableroGaleriaRef = useRef<HTMLInputElement>(null);

  const [patente, setPatente] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [km, setKm] = useState("");
  const [estadoGeneral, setEstadoGeneral] = useState("");
  const [tieneDanios, setTieneDanios] = useState(false);
  const [revisarPatente, setRevisarPatente] = useState(false);
  const [revisarMarca, setRevisarMarca] = useState(false);
  const [revisarKm, setRevisarKm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function agregarFotos(set: React.Dispatch<React.SetStateAction<File[]>>, max: number, files: File[]) {
    if (files.length === 0) return;
    set((prev) => {
      const disponibles = max - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  async function leerExterior() {
    if (fotosExterior.length === 0) return;
    setLeyendoExterior(true);
    setNotaExterior(null);
    try {
      const fd = new FormData();
      for (const f of fotosExterior) {
        const jpeg = await resizeImageToJpeg(f);
        fd.append("fotos", jpeg, "exterior.jpg");
      }
      const res = await fetch("/api/vehiculos/leer-exterior", { method: "POST", body: fd });
      const data: Partial<ExteriorLectura> & { error?: string } = await res.json();
      if (!res.ok) {
        setNotaExterior(data.error || "No se pudo leer las fotos.");
        return;
      }
      if (data.patente) setPatente(data.patente);
      if (data.marcaModelo) setMarcaModelo(data.marcaModelo);
      if (data.estadoGeneral) setEstadoGeneral(data.estadoGeneral);
      if (data.tieneDanios != null) setTieneDanios(data.tieneDanios);
      setRevisarPatente(data.identificadoPatente !== true);
      setRevisarMarca(data.identificadoMarca !== true);
      setNotaExterior("Listo — revisá los datos antes de guardar, sobre todo si quedaron marcados para revisar.");
      setFotoExteriorGuardar(fotosExterior[0]);
      setFotosExterior([]);
    } catch (err) {
      setNotaExterior("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo exterior de vehículo con IA", "leer-exterior-vehiculo");
    } finally {
      setLeyendoExterior(false);
    }
  }

  async function leerTablero() {
    if (fotosTablero.length === 0) return;
    setLeyendoTablero(true);
    setNotaTablero(null);
    try {
      const fd = new FormData();
      for (const f of fotosTablero) {
        const jpeg = await resizeImageToJpeg(f);
        fd.append("fotos", jpeg, "tablero.jpg");
      }
      const res = await fetch("/api/vehiculos/leer-tablero", { method: "POST", body: fd });
      const data: Partial<TableroLectura> & { error?: string } = await res.json();
      if (!res.ok) {
        setNotaTablero(data.error || "No se pudo leer las fotos.");
        return;
      }
      if (data.kilometraje != null) setKm(String(data.kilometraje));
      setRevisarKm(data.identificado !== true);
      setNotaTablero(
        data.kilometraje != null
          ? "Listo — revisá el kilometraje antes de guardar."
          : "No se pudo leer el kilometraje con certeza — completalo a mano.",
      );
      setFotoTableroGuardar(fotosTablero[0]);
      setFotosTablero([]);
    } catch (err) {
      setNotaTablero("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo tablero de vehículo con IA", "leer-tablero-vehiculo");
    } finally {
      setLeyendoTablero(false);
    }
  }

  async function guardar() {
    setError(null);
    if (!patente.trim()) {
      setError("Falta la patente.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({ patente, marcaModelo, kilometrajeActual: km, estadoGeneral, tieneDanios }),
      );
      if (fotoExteriorGuardar) fd.append("fotoExterior", await resizeImageToJpeg(fotoExteriorGuardar), "exterior.jpg");
      if (fotoTableroGuardar) fd.append("fotoTablero", await resizeImageToJpeg(fotoTableroGuardar), "tablero.jpg");
      const res = await altaVehiculoConFotosAction(fd);
      if (!res.success) {
        setError(res.error || "No se pudo dar de alta el vehículo.");
        reportarErrorCliente(res.error || "No se pudo dar de alta el vehículo.", "alta-vehiculo-fotos");
        return;
      }
      setSuccess(true);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "alta-vehiculo-fotos", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="card">
        <SuccessNote>Vehículo {patente} dado de alta correctamente.</SuccessNote>
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={() => router.push("/panel/vehiculos")}>
            Volver a la flota
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="section-label">
          <Icon name="camera" size={14} /> Fotos del exterior
        </div>
        <div className="hint" style={{ margin: "-2px 0 10px" }}>
          Patente, marca/modelo y estado general (rayones, roturas) — sacale una o más fotos al vehículo desde afuera.
        </div>
        <input
          ref={exteriorCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotos(setFotosExterior, VEHICULO_EXTERIOR_FOTO_MAX, files);
          }}
        />
        <input
          ref={exteriorGaleriaRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotos(setFotosExterior, VEHICULO_EXTERIOR_FOTO_MAX, files);
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: fotosExterior.length ? 8 : 0 }}>
          <button
            type="button"
            className="ai-btn"
            onClick={() => exteriorCameraRef.current?.click()}
            disabled={submitting || leyendoExterior || fotosExterior.length >= VEHICULO_EXTERIOR_FOTO_MAX}
          >
            <Icon name="camera" size={13} /> Sacar foto ({fotosExterior.length}/{VEHICULO_EXTERIOR_FOTO_MAX})
          </button>
          <button
            type="button"
            className="ai-btn"
            onClick={() => exteriorGaleriaRef.current?.click()}
            disabled={submitting || leyendoExterior || fotosExterior.length >= VEHICULO_EXTERIOR_FOTO_MAX}
          >
            <Icon name="upload" size={13} /> Subir foto
          </button>
          {fotosExterior.length > 0 && (
            <button type="button" className="ai-btn" onClick={() => void leerExterior()} disabled={submitting || leyendoExterior}>
              <Icon name="ai" size={13} /> {leyendoExterior ? "Leyendo..." : `Leer con IA (${fotosExterior.length})`}
            </button>
          )}
        </div>
        {fotosExterior.length > 0 && (
          <div className="chip-row" style={{ marginTop: 0, marginBottom: 8 }}>
            {fotosExterior.map((f, i) => (
              <span className="chip" key={i}>
                Foto {i + 1}
                <button
                  type="button"
                  onClick={() => setFotosExterior((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={leyendoExterior}
                  aria-label={`Quitar foto ${i + 1}`}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {notaExterior && (
          <div className="ai-note">
            <span>{notaExterior}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">
          <Icon name="camera" size={14} /> Foto del tablero
        </div>
        <div className="hint" style={{ margin: "-2px 0 10px" }}>
          Kilometraje — sacale una foto clara al odómetro.
        </div>
        <input
          ref={tableroCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotos(setFotosTablero, VEHICULO_TABLERO_FOTO_MAX, files);
          }}
        />
        <input
          ref={tableroGaleriaRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotos(setFotosTablero, VEHICULO_TABLERO_FOTO_MAX, files);
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: fotosTablero.length ? 8 : 0 }}>
          <button
            type="button"
            className="ai-btn"
            onClick={() => tableroCameraRef.current?.click()}
            disabled={submitting || leyendoTablero || fotosTablero.length >= VEHICULO_TABLERO_FOTO_MAX}
          >
            <Icon name="camera" size={13} /> Sacar foto ({fotosTablero.length}/{VEHICULO_TABLERO_FOTO_MAX})
          </button>
          <button
            type="button"
            className="ai-btn"
            onClick={() => tableroGaleriaRef.current?.click()}
            disabled={submitting || leyendoTablero || fotosTablero.length >= VEHICULO_TABLERO_FOTO_MAX}
          >
            <Icon name="upload" size={13} /> Subir foto
          </button>
          {fotosTablero.length > 0 && (
            <button type="button" className="ai-btn" onClick={() => void leerTablero()} disabled={submitting || leyendoTablero}>
              <Icon name="ai" size={13} /> {leyendoTablero ? "Leyendo..." : `Leer con IA (${fotosTablero.length})`}
            </button>
          )}
        </div>
        {fotosTablero.length > 0 && (
          <div className="chip-row" style={{ marginTop: 0, marginBottom: 8 }}>
            {fotosTablero.map((f, i) => (
              <span className="chip" key={i}>
                Foto {i + 1}
                <button
                  type="button"
                  onClick={() => setFotosTablero((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={leyendoTablero}
                  aria-label={`Quitar foto ${i + 1}`}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {notaTablero && (
          <div className="ai-note">
            <span>{notaTablero}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Datos del vehículo</div>
        <div className="hint" style={{ margin: "-2px 0 12px" }}>
          Estos son los que se guardan — revisá y corregí lo que haga falta antes de dar de alta.
        </div>
        <div className="tech-form-grid">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              Patente <span className="req">*</span>
            </label>
            <input type="text" value={patente} onChange={(e) => setPatente(e.target.value.toUpperCase())} disabled={submitting} />
            {revisarPatente && patente && (
              <div className="hint" style={{ color: "var(--warn)", margin: "4px 0 0" }}>
                <Icon name="warning" size={11} /> La IA no la leyó con total claridad — confirmá que esté bien.
              </div>
            )}
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Marca / Modelo</label>
            <input type="text" value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} disabled={submitting} />
            {revisarMarca && marcaModelo && (
              <div className="hint" style={{ color: "var(--warn)", margin: "4px 0 0" }}>
                <Icon name="warning" size={11} /> No muy segura — confirmá marca y modelo.
              </div>
            )}
          </div>
        </div>
        <div className="field">
          <label>Kilometraje actual</label>
          <input type="text" inputMode="numeric" placeholder="Ej: 84500" value={km} onChange={(e) => setKm(e.target.value)} disabled={submitting} style={{ maxWidth: 200 }} />
          {revisarKm && km && (
            <div className="hint" style={{ color: "var(--warn)", margin: "4px 0 0" }}>
              <Icon name="warning" size={11} /> La IA no lo leyó con total claridad — confirmá el número.
            </div>
          )}
        </div>
        <div className="field">
          <label>
            Estado general <span className="opt">(rayones/roturas)</span>
          </label>
          <textarea value={estadoGeneral} onChange={(e) => setEstadoGeneral(e.target.value)} disabled={submitting} rows={3} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={tieneDanios} onChange={(e) => setTieneDanios(e.target.checked)} disabled={submitting} />
          Tiene daños visibles
        </label>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={submitting}>
            {submitting ? "Guardando..." : "Dar de alta"}
          </button>
        </div>
      </div>
    </div>
  );
}
