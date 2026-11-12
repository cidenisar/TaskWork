"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { crearControlVehiculoAction, agregarFotosControlVehiculoAction } from "@/app/(app)/control-vehiculo/nuevo/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/spinner";
import { VEHICULO_EXTERIOR_FOTO_MAX, VEHICULO_INTERIOR_FOTO_MAX } from "@/components/panel/vehiculos/alta-types";

export interface VehiculoOpcion {
  id: string;
  patente: string;
  marcaModelo: string | null;
}

// Mismo motivo que el alta de vehículo (nuevo-vehiculo-form.tsx): subir hasta
// 14 fotos reales en un solo pedido puede superar el límite de tamaño de
// request de la plataforma — se suben de a pocas por vez, en tandas.
const FOTOS_POR_TANDA = 3;

/** Foto de una etiqueta (matafuego/botiquín) + "Leer con IA" que completa la fecha — siempre queda editable, nunca se guarda a ciegas. */
function EtiquetaVencimiento({
  label,
  foto,
  setFoto,
  vencimiento,
  setVencimiento,
  leyendo,
  nota,
  onLeer,
  disabled,
}: {
  label: string;
  foto: File | null;
  setFoto: (f: File | null) => void;
  vencimiento: string;
  setVencimiento: (v: string) => void;
  leyendo: boolean;
  nota: string | null;
  onLeer: () => void;
  disabled: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file) setFoto(file);
        }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <button type="button" className="ai-btn" onClick={() => cameraRef.current?.click()} disabled={disabled}>
          <Icon name="camera" size={13} /> {foto ? "Cambiar foto" : "Foto de la etiqueta"}
        </button>
        {foto && (
          <button type="button" className="ai-btn" onClick={onLeer} disabled={disabled || leyendo}>
            {leyendo ? <Spinner size={14} /> : <Icon name="ai" size={13} />} {leyendo ? "Leyendo..." : "Leer con IA"}
          </button>
        )}
      </div>
      {foto && (
        <div className="chip-row" style={{ marginTop: 0, marginBottom: 6 }}>
          <span className="chip">
            Foto cargada
            <button type="button" onClick={() => setFoto(null)} disabled={leyendo || disabled} aria-label="Quitar foto">
              <Icon name="x" size={11} />
            </button>
          </span>
        </div>
      )}
      <input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} disabled={disabled} />
      {nota && (
        <div className="ai-note" style={{ marginTop: 6 }}>
          <span>{nota}</span>
        </div>
      )}
    </div>
  );
}

export function NuevaControlVehiculoForm({ vehiculos }: { vehiculos: VehiculoOpcion[] }) {
  const router = useRouter();

  const [vehiculoId, setVehiculoId] = useState("");
  const [km, setKm] = useState("");
  const [leyendoKm, setLeyendoKm] = useState(false);
  const [notaKm, setNotaKm] = useState<string | null>(null);

  const [vencimientoMatafuego, setVencimientoMatafuego] = useState("");
  const [fotoMatafuego, setFotoMatafuego] = useState<File | null>(null);
  const [leyendoMatafuego, setLeyendoMatafuego] = useState(false);
  const [notaMatafuego, setNotaMatafuego] = useState<string | null>(null);

  const [vencimientoBotiquin, setVencimientoBotiquin] = useState("");
  const [fotoBotiquin, setFotoBotiquin] = useState<File | null>(null);
  const [leyendoBotiquin, setLeyendoBotiquin] = useState(false);
  const [notaBotiquin, setNotaBotiquin] = useState<string | null>(null);

  const [fotosExterior, setFotosExterior] = useState<File[]>([]);
  const exteriorCameraRef = useRef<HTMLInputElement>(null);
  const exteriorGaleriaRef = useRef<HTMLInputElement>(null);

  const [fotosInterior, setFotosInterior] = useState<File[]>([]);
  const interiorCameraRef = useRef<HTMLInputElement>(null);
  const interiorGaleriaRef = useRef<HTMLInputElement>(null);

  const [comparando, setComparando] = useState(false);
  const [notaComparacion, setNotaComparacion] = useState<string | null>(null);
  const [estadoGeneral, setEstadoGeneral] = useState("");
  const [tieneDanios, setTieneDanios] = useState<boolean | null>(null);
  const [inconsistencias, setInconsistencias] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [notaFotosFallidas, setNotaFotosFallidas] = useState<string | null>(null);

  function agregarFotos(set: React.Dispatch<React.SetStateAction<File[]>>, max: number, files: File[]) {
    if (files.length === 0) return;
    set((prev) => {
      const disponibles = max - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  async function compararConIa() {
    if (!vehiculoId) {
      setNotaComparacion("Elegí primero el vehículo.");
      return;
    }
    if (fotosExterior.length === 0) return;
    setComparando(true);
    setNotaComparacion(null);
    try {
      const fd = new FormData();
      fd.append("vehiculoId", vehiculoId);
      for (const f of fotosExterior) {
        const jpeg = await resizeImageToJpeg(f);
        fd.append("fotos", jpeg, "control.jpg");
      }
      const res = await fetch("/api/vehiculos/comparar-estado", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setNotaComparacion(data.error || "No se pudo leer las fotos.");
        return;
      }
      if (data.estadoGeneral) setEstadoGeneral(data.estadoGeneral);
      if (data.tieneDanios != null) setTieneDanios(data.tieneDanios);
      setInconsistencias(data.inconsistenciasDetectadas || "");
      setNotaComparacion(
        data.tieneReferencia
          ? data.inconsistenciasDetectadas
            ? "⚠ La IA encontró algo distinto respecto del control anterior — revisá abajo antes de guardar."
            : "Listo — sin diferencias respecto del control anterior. Revisá el estado antes de guardar."
          : "Listo — es el primer control con fotos de este vehículo, no hay nada contra qué comparar todavía.",
      );
    } catch (err) {
      setNotaComparacion("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error comparando estado de vehículo con IA", "comparar-estado-vehiculo");
    } finally {
      setComparando(false);
    }
  }

  async function leerKilometraje() {
    if (fotosInterior.length === 0) {
      setNotaKm("Sacá primero una foto del tablero/odómetro.");
      return;
    }
    setLeyendoKm(true);
    setNotaKm(null);
    try {
      const fd = new FormData();
      for (const f of fotosInterior) {
        const jpeg = await resizeImageToJpeg(f);
        fd.append("fotos", jpeg, "interior.jpg");
      }
      const res = await fetch("/api/vehiculos/leer-tablero", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setNotaKm(data.error || "No se pudo leer la foto.");
        return;
      }
      if (data.kilometraje != null) setKm(String(data.kilometraje));
      setNotaKm(
        data.kilometraje != null
          ? "Listo — revisá el kilometraje antes de guardar."
          : "No se pudo leer el kilometraje con certeza — completalo a mano.",
      );
    } catch (err) {
      setNotaKm("No se pudo leer la foto.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo kilometraje de vehículo con IA", "leer-tablero-control-vehiculo");
    } finally {
      setLeyendoKm(false);
    }
  }

  async function leerVencimientoEtiqueta(
    tipo: "matafuego" | "botiquin",
    foto: File | null,
    setFecha: (v: string) => void,
    setNota: (v: string | null) => void,
    setLeyendo: (v: boolean) => void,
  ) {
    if (!foto) return;
    setLeyendo(true);
    setNota(null);
    try {
      const fd = new FormData();
      fd.append("tipo", tipo);
      fd.append("foto", await resizeImageToJpeg(foto), `${tipo}.jpg`);
      const res = await fetch("/api/vehiculos/leer-vencimiento-seguridad", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setNota(data.error || "No se pudo leer la foto.");
        return;
      }
      if (data.fecha) setFecha(data.fecha);
      setNota(data.fecha ? "Listo — revisá la fecha antes de guardar." : "No se pudo leer la fecha con certeza — completala a mano.");
    } catch (err) {
      setNota("No se pudo leer la foto.");
      reportarErrorCliente(
        err instanceof Error ? err.message : `Error leyendo vencimiento de ${tipo} con IA`,
        "leer-vencimiento-seguridad-vehiculo",
      );
    } finally {
      setLeyendo(false);
    }
  }

  async function subirFotosEnTandas(controlId: string, carpeta: "exterior" | "interior", fotos: File[]): Promise<number> {
    let fallidas = 0;
    for (let i = 0; i < fotos.length; i += FOTOS_POR_TANDA) {
      const tanda = fotos.slice(i, i + FOTOS_POR_TANDA);
      const fd = new FormData();
      fd.append("controlId", controlId);
      fd.append("carpeta", carpeta);
      for (let j = 0; j < tanda.length; j++) {
        fd.append("fotos", await resizeImageToJpeg(tanda[j]), `${carpeta}-${i + j + 1}.jpg`);
      }
      try {
        const res = await agregarFotosControlVehiculoAction(fd);
        if (!res.success) fallidas += tanda.length;
      } catch {
        fallidas += tanda.length;
      }
    }
    return fallidas;
  }

  async function guardar() {
    setError(null);
    setNotaFotosFallidas(null);
    if (!vehiculoId) return setError("Elegí el vehículo.");
    if (!km.trim() || !Number.isFinite(Number(km))) return setError("Falta el kilometraje actual.");
    if (fotosExterior.length === 0) return setError("Sacale al menos una foto al exterior del vehículo.");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          vehiculoId,
          kilometraje: km,
          vencimientoMatafuego: vencimientoMatafuego || undefined,
          vencimientoBotiquin: vencimientoBotiquin || undefined,
          estadoGeneral: estadoGeneral || undefined,
          tieneDanios,
          inconsistenciasDetectadas: inconsistencias || null,
        }),
      );
      const res = await crearControlVehiculoAction(fd);
      if (!res.success || !res.controlId) {
        const mensaje = res.error || "No se pudo registrar el control.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "crear-control-vehiculo");
        return;
      }

      // El control ya quedó registrado — una foto que falla al subir no debe
      // hacer parecer que se perdió todo lo demás.
      const fallidasExterior = await subirFotosEnTandas(res.controlId, "exterior", fotosExterior);
      const fallidasInterior = await subirFotosEnTandas(res.controlId, "interior", fotosInterior);
      const totalFallidas = fallidasExterior + fallidasInterior;
      if (totalFallidas > 0) {
        setNotaFotosFallidas(
          `El control se registró, pero ${totalFallidas} foto${totalFallidas === 1 ? "" : "s"} no se pudo subir — podés volver a intentarlo cargando otro control.`,
        );
      }
      setSuccess(true);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "crear-control-vehiculo", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="card">
        <SuccessNote>Control registrado correctamente.</SuccessNote>
        {notaFotosFallidas && (
          <div className="hint" style={{ color: "var(--warn)", margin: "8px 0 0" }}>
            <Icon name="warning" size={12} /> {notaFotosFallidas}
          </div>
        )}
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={() => router.push("/control-vehiculo/historial")}>
            Ver historial
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="field">
          <label>
            Vehículo <span className="req">*</span>
          </label>
          <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} disabled={submitting}>
            <option value="">Seleccionar vehículo...</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.patente} {v.marcaModelo ? `— ${v.marcaModelo}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>
            Kilometraje actual <span className="req">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Ej: 84500"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            disabled={submitting}
            style={{ maxWidth: 200 }}
          />
        </div>
      </div>

      <div className="card">
        <div className="section-label">
          <Icon name="camera" size={14} /> Fotos del exterior <span className="req">*</span>
        </div>
        <div className="hint" style={{ margin: "-2px 0 10px" }}>
          Pintura, cubiertas, ópticas y espejos — sacale una o más fotos al vehículo desde afuera, como en el alta.
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
            disabled={submitting || fotosExterior.length >= VEHICULO_EXTERIOR_FOTO_MAX}
          >
            <Icon name="camera" size={13} /> Sacar foto ({fotosExterior.length}/{VEHICULO_EXTERIOR_FOTO_MAX})
          </button>
          <button
            type="button"
            className="ai-btn"
            onClick={() => exteriorGaleriaRef.current?.click()}
            disabled={submitting || fotosExterior.length >= VEHICULO_EXTERIOR_FOTO_MAX}
          >
            <Icon name="upload" size={13} /> Subir foto
          </button>
          {fotosExterior.length > 0 && (
            <button type="button" className="ai-btn" onClick={() => void compararConIa()} disabled={submitting || comparando}>
              {comparando ? <Spinner size={14} /> : <Icon name="ai" size={13} />} {comparando ? "Comparando..." : "Comparar con IA"}
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
                  disabled={comparando || submitting}
                  aria-label={`Quitar foto ${i + 1}`}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {notaComparacion && (
          <div className="ai-note">
            <span>{notaComparacion}</span>
          </div>
        )}
        {(estadoGeneral || inconsistencias) && (
          <div className="field" style={{ marginTop: 8 }}>
            <label>Estado detectado por la IA (revisable)</label>
            <textarea value={estadoGeneral} onChange={(e) => setEstadoGeneral(e.target.value)} disabled={submitting} rows={2} />
            {inconsistencias && (
              <div className="hint" style={{ color: "var(--warn)", margin: "4px 0 0" }}>
                <Icon name="warning" size={11} /> {inconsistencias}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">
          <Icon name="camera" size={14} /> Fotos del interior <span className="opt">(opcional)</span>
        </div>
        <div className="hint" style={{ margin: "-2px 0 10px" }}>
          Tapizado, parabrisas desde adentro, y el tablero/odómetro si querés que la IA te lea el kilometraje.
        </div>
        <input
          ref={interiorCameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotos(setFotosInterior, VEHICULO_INTERIOR_FOTO_MAX, files);
          }}
        />
        <input
          ref={interiorGaleriaRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotos(setFotosInterior, VEHICULO_INTERIOR_FOTO_MAX, files);
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: fotosInterior.length ? 8 : 0 }}>
          <button
            type="button"
            className="ai-btn"
            onClick={() => interiorCameraRef.current?.click()}
            disabled={submitting || fotosInterior.length >= VEHICULO_INTERIOR_FOTO_MAX}
          >
            <Icon name="camera" size={13} /> Sacar foto ({fotosInterior.length}/{VEHICULO_INTERIOR_FOTO_MAX})
          </button>
          <button
            type="button"
            className="ai-btn"
            onClick={() => interiorGaleriaRef.current?.click()}
            disabled={submitting || fotosInterior.length >= VEHICULO_INTERIOR_FOTO_MAX}
          >
            <Icon name="upload" size={13} /> Subir foto
          </button>
          {fotosInterior.length > 0 && (
            <button type="button" className="ai-btn" onClick={() => void leerKilometraje()} disabled={submitting || leyendoKm}>
              {leyendoKm ? <Spinner size={14} /> : <Icon name="ai" size={13} />} {leyendoKm ? "Leyendo..." : "Leer kilometraje con IA"}
            </button>
          )}
        </div>
        {fotosInterior.length > 0 && (
          <div className="chip-row" style={{ marginTop: 0, marginBottom: 8 }}>
            {fotosInterior.map((f, i) => (
              <span className="chip" key={i}>
                Foto {i + 1}
                <button
                  type="button"
                  onClick={() => setFotosInterior((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={submitting}
                  aria-label={`Quitar foto ${i + 1}`}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {notaKm && (
          <div className="ai-note">
            <span>{notaKm}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Seguridad del vehículo</div>
        <div className="hint" style={{ margin: "-2px 0 10px" }}>
          Sacale una foto a la etiqueta de vencimiento de cada uno y la IA te completa la fecha — revisala antes de guardar. Si no sabés
          o no la tiene, dejalo en blanco.
        </div>
        <div className="grid2">
          <EtiquetaVencimiento
            label="Matafuego"
            foto={fotoMatafuego}
            setFoto={setFotoMatafuego}
            vencimiento={vencimientoMatafuego}
            setVencimiento={setVencimientoMatafuego}
            leyendo={leyendoMatafuego}
            nota={notaMatafuego}
            onLeer={() => void leerVencimientoEtiqueta("matafuego", fotoMatafuego, setVencimientoMatafuego, setNotaMatafuego, setLeyendoMatafuego)}
            disabled={submitting}
          />
          <EtiquetaVencimiento
            label="Botiquín"
            foto={fotoBotiquin}
            setFoto={setFotoBotiquin}
            vencimiento={vencimientoBotiquin}
            setVencimiento={setVencimientoBotiquin}
            leyendo={leyendoBotiquin}
            nota={notaBotiquin}
            onLeer={() => void leerVencimientoEtiqueta("botiquin", fotoBotiquin, setVencimientoBotiquin, setNotaBotiquin, setLeyendoBotiquin)}
            disabled={submitting}
          />
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="footer-nav">
        <span />
        <button type="button" className="btn btn-primary" onClick={() => void guardar()} disabled={submitting}>
          {submitting ? "Guardando..." : "Registrar control"}
        </button>
      </div>
    </div>
  );
}
