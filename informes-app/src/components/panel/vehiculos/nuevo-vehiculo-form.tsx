"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { altaVehiculoAction, agregarFotosVehiculoAction } from "@/app/(app)/configuracion/actions/vehiculos";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/spinner";
import { VEHICULO_EXTERIOR_FOTO_MAX, VEHICULO_INTERIOR_FOTO_MAX } from "./alta-types";
import { mezclarHallazgos, type HallazgoInspeccionIa } from "@/lib/inspeccion-ia/types";
import { HallazgosInspeccionIaSection } from "@/components/inspeccion-ia/hallazgos-section";
import type { EstadoChecklist } from "@/lib/database.types";

interface ExteriorLectura {
  patente: string;
  marcaModelo: string;
  estadoGeneral: string;
  tieneDanios: boolean | null;
  identificadoPatente: boolean;
  identificadoMarca: boolean;
  hallazgos?: HallazgoInspeccionIa[];
}

interface InteriorLectura {
  kilometraje: number | null;
  identificado: boolean;
  hallazgos?: HallazgoInspeccionIa[];
}

/**
 * Alta de vehículo con fotos — mismo sistema de lectura con IA que Racks/
 * Equipos/Torres, pero acá las fotos se mandan en dos lotes separados
 * porque son dos cosas físicamente distintas: fotos del EXTERIOR (patente,
 * marca/modelo, pintura, cubiertas, ópticas) y del INTERIOR (kilometraje del
 * odómetro, tapizado, parabrisas desde adentro). Cada lote tiene su propio
 * botón "Leer con IA" — se puede leer uno sin el otro, se puede leer en
 * varias tandas (ej. frente/atrás/laterales), y los resultados de cada
 * tanda caen en los mismos campos editables de abajo, que son los que
 * realmente se guardan (la IA nunca escribe directo a la base). TODAS las
 * fotos de los dos lotes quedan guardadas como galería visual del estado
 * del vehículo al momento del alta, no solo una representativa.
 */
export function NuevoVehiculoForm({ catalogoHallazgos }: { catalogoHallazgos: { id: string; texto: string }[] }) {
  const router = useRouter();

  const [fotosExterior, setFotosExterior] = useState<File[]>([]);
  const [leyendoExterior, setLeyendoExterior] = useState(false);
  const [notaExterior, setNotaExterior] = useState<string | null>(null);
  /** Todas las fotos de exterior ya leídas (de todas las tandas) — se guardan como galería del estado al alta. */
  const [fotosExteriorGuardar, setFotosExteriorGuardar] = useState<File[]>([]);
  const exteriorCameraRef = useRef<HTMLInputElement>(null);
  const exteriorGaleriaRef = useRef<HTMLInputElement>(null);

  const [fotosInterior, setFotosInterior] = useState<File[]>([]);
  const [leyendoInterior, setLeyendoInterior] = useState(false);
  const [notaInterior, setNotaInterior] = useState<string | null>(null);
  const [fotosInteriorGuardar, setFotosInteriorGuardar] = useState<File[]>([]);
  const interiorCameraRef = useRef<HTMLInputElement>(null);
  const interiorGaleriaRef = useRef<HTMLInputElement>(null);

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
  const [notaFotosFallidas, setNotaFotosFallidas] = useState<string | null>(null);

  // Mismo catálogo evaluado desde los dos lotes de fotos (exterior e
  // interior) — arranca sin evaluar (estado null) y cada lectura con IA va
  // sumando resultados al mismo estado vía mezclarHallazgos, igual criterio
  // que un relevamiento multi-foto en otros módulos.
  const [hallazgos, setHallazgos] = useState<HallazgoInspeccionIa[]>(
    () => catalogoHallazgos.map((h) => ({ itemId: h.id, texto: h.texto, estado: null, comentario: "" })),
  );

  function setEstadoHallazgo(itemId: string, estado: EstadoChecklist) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, estado } : h)));
  }

  function setComentarioHallazgo(itemId: string, comentario: string) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, comentario } : h)));
  }

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
      if (data.hallazgos && data.hallazgos.length > 0) {
        setHallazgos(mezclarHallazgos(hallazgos, data.hallazgos));
      }
      setNotaExterior("Listo — revisá los datos antes de guardar, sobre todo si quedaron marcados para revisar.");
      setFotosExteriorGuardar((prev) => [...prev, ...fotosExterior]);
      setFotosExterior([]);
    } catch (err) {
      setNotaExterior("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo exterior de vehículo con IA", "leer-exterior-vehiculo");
    } finally {
      setLeyendoExterior(false);
    }
  }

  async function leerInterior() {
    if (fotosInterior.length === 0) return;
    setLeyendoInterior(true);
    setNotaInterior(null);
    try {
      const fd = new FormData();
      for (const f of fotosInterior) {
        const jpeg = await resizeImageToJpeg(f);
        fd.append("fotos", jpeg, "interior.jpg");
      }
      const res = await fetch("/api/vehiculos/leer-tablero", { method: "POST", body: fd });
      const data: Partial<InteriorLectura> & { error?: string } = await res.json();
      if (!res.ok) {
        setNotaInterior(data.error || "No se pudo leer las fotos.");
        return;
      }
      if (data.kilometraje != null) setKm(String(data.kilometraje));
      setRevisarKm(data.identificado !== true);
      if (data.hallazgos && data.hallazgos.length > 0) {
        setHallazgos(mezclarHallazgos(hallazgos, data.hallazgos));
      }
      setNotaInterior(
        data.kilometraje != null
          ? "Listo — revisá el kilometraje antes de guardar."
          : "No se pudo leer el kilometraje con certeza — completalo a mano.",
      );
      setFotosInteriorGuardar((prev) => [...prev, ...fotosInterior]);
      setFotosInterior([]);
    } catch (err) {
      setNotaInterior("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo interior de vehículo con IA", "leer-interior-vehiculo");
    } finally {
      setLeyendoInterior(false);
    }
  }

  // Tope chico a propósito: juntar muchas fotos ya comprimidas en un solo
  // pedido (como se hacía antes, las ~14 fotos + el resto del payload en una
  // sola Server Action) puede superar el límite de tamaño de request que la
  // plataforma de hosting le impone a una función — ahí el pedido se corta
  // antes de llegar al servidor, sin dejar ningún rastro ("An unexpected
  // response was received from the server", sin más detalle, y nada
  // guardado). Subiendo de a pocas fotos por vez, cada pedido queda bien
  // por debajo de cualquier límite razonable sin importar cuántas fotos
  // saque el técnico en total.
  const FOTOS_POR_TANDA = 3;

  async function subirGaleriaEnTandas(vehiculoId: string, carpeta: "exterior" | "interior", fotos: File[]): Promise<number> {
    let fallidas = 0;
    for (let i = 0; i < fotos.length; i += FOTOS_POR_TANDA) {
      const tanda = fotos.slice(i, i + FOTOS_POR_TANDA);
      const fd = new FormData();
      fd.append("vehiculoId", vehiculoId);
      fd.append("carpeta", carpeta);
      for (let j = 0; j < tanda.length; j++) {
        fd.append("fotos", await resizeImageToJpeg(tanda[j]), `${carpeta}-${i + j + 1}.jpg`);
      }
      try {
        const res = await agregarFotosVehiculoAction(fd);
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
    if (!patente.trim()) {
      setError("Falta la patente.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          patente,
          marcaModelo,
          kilometrajeActual: km,
          estadoGeneral,
          tieneDanios,
          hallazgos: hallazgos
            .filter((h) => h.estado !== null)
            .map((h) => ({ itemId: h.itemId, estado: h.estado, comentario: h.comentario.trim() })),
        }),
      );
      const res = await altaVehiculoAction(fd);
      if (!res.success || !res.vehiculoId) {
        setError(res.error || "No se pudo dar de alta el vehículo.");
        reportarErrorCliente(res.error || "No se pudo dar de alta el vehículo.", "alta-vehiculo-fotos");
        return;
      }

      // El vehículo ya quedó dado de alta acá — una foto que falla al subir
      // no debe hacer parecer que todo el alta falló (nunca se pierde lo
      // ya guardado por un problema en un paso posterior y opcional).
      const fallidasExterior = await subirGaleriaEnTandas(res.vehiculoId, "exterior", fotosExteriorGuardar);
      const fallidasInterior = await subirGaleriaEnTandas(res.vehiculoId, "interior", fotosInteriorGuardar);
      const totalFallidas = fallidasExterior + fallidasInterior;
      if (totalFallidas > 0) {
        setNotaFotosFallidas(
          `El vehículo se dio de alta, pero ${totalFallidas} foto${totalFallidas === 1 ? "" : "s"} no se pudo subir — volvé a intentarlo más tarde desde la ficha del vehículo.`,
        );
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
        {notaFotosFallidas && (
          <div className="hint" style={{ color: "var(--warn)", margin: "8px 0 0" }}>
            <Icon name="warning" size={12} /> {notaFotosFallidas}
          </div>
        )}
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
          Patente, marca/modelo, pintura, cubiertas, ópticas y espejos — sacale una o más fotos al vehículo desde afuera.
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
              {leyendoExterior ? <Spinner /> : <Icon name="ai" size={13} />} {leyendoExterior ? "Leyendo..." : `Leer con IA (${fotosExterior.length})`}
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
          <Icon name="camera" size={14} /> Fotos del interior
        </div>
        <div className="hint" style={{ margin: "-2px 0 10px" }}>
          Kilometraje, tapizado, parabrisas desde adentro — sacale una o más fotos al habitáculo.
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
            disabled={submitting || leyendoInterior || fotosInterior.length >= VEHICULO_INTERIOR_FOTO_MAX}
          >
            <Icon name="camera" size={13} /> Sacar foto ({fotosInterior.length}/{VEHICULO_INTERIOR_FOTO_MAX})
          </button>
          <button
            type="button"
            className="ai-btn"
            onClick={() => interiorGaleriaRef.current?.click()}
            disabled={submitting || leyendoInterior || fotosInterior.length >= VEHICULO_INTERIOR_FOTO_MAX}
          >
            <Icon name="upload" size={13} /> Subir foto
          </button>
          {fotosInterior.length > 0 && (
            <button type="button" className="ai-btn" onClick={() => void leerInterior()} disabled={submitting || leyendoInterior}>
              {leyendoInterior ? <Spinner /> : <Icon name="ai" size={13} />} {leyendoInterior ? "Leyendo..." : `Leer con IA (${fotosInterior.length})`}
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
                  disabled={leyendoInterior}
                  aria-label={`Quitar foto ${i + 1}`}
                >
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {notaInterior && (
          <div className="ai-note">
            <span>{notaInterior}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Datos del vehículo</div>
        <div className="hint" style={{ margin: "-2px 0 12px" }}>
          Estos son los que se guardan — revisá y corregí lo que haga falta antes de dar de alta.
        </div>

        <HallazgosInspeccionIaSection
          hallazgos={hallazgos}
          onEstado={setEstadoHallazgo}
          onComentario={setComentarioHallazgo}
          disabled={submitting}
        />

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
