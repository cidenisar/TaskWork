"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { darDeAltaMaterialesAction, type PayloadMaterialAlta } from "@/app/panel/materiales/alta-actions";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import type { Ubicacion } from "@/components/ubicaciones/types";
import { CATEGORIA_EQUIPO_OPCIONES, CATEGORIA_EQUIPO_LABEL, EQUIPO_FOTO_IA_MAX } from "@/components/equipos/types";
import { TIPO_MONTAJE_OPCIONES, TIPO_MONTAJE_LABEL, calcularRecursoAltura, type ConfigRecursoAltura } from "@/lib/equipos/recurso-altura";
import type { EquipoCategoria } from "@/lib/database.types";
import { Icon } from "@/components/icon";
import { reportarErrorCliente } from "@/lib/client-error-report";

/**
 * `revisar`/`posibleObsolescencia` son transitorios de UI (igual criterio
 * que MaterialInformeItem en Informe Técnico) — nunca se mandan al server
 * action, se sacan antes en `guardar()`.
 */
type MaterialAltaItem = PayloadMaterialAlta & {
  revisar: boolean;
  posibleObsolescencia: string | null;
};

const MATERIAL_BASE: MaterialAltaItem = {
  categoriaEquipo: "otro",
  descripcion: "",
  marcaModelo: "",
  numeroSerie: "",
  etiquetaYpf: "",
  cantidad: 1,
  consumoPromedioW: null,
  consumoMaxW: null,
  tipoMontaje: null,
  alturaMontajeM: null,
  revisar: false,
  posibleObsolescencia: null,
};

export function AltaMaterialForm({
  ubicaciones,
  provincias,
  recursoAlturaConfig,
}: {
  ubicaciones: Ubicacion[];
  provincias: string[];
  recursoAlturaConfig: ConfigRecursoAltura[];
}) {
  const router = useRouter();
  const [provinciaFiltro, setProvinciaFiltro] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [localidadNueva, setLocalidadNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [plantaNueva, setPlantaNueva] = useState("");
  const [oficinaNueva, setOficinaNueva] = useState("");
  const [gps, setGps] = useState<GpsCapturado | null>(null);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [materiales, setMateriales] = useState<MaterialAltaItem[]>([{ ...MATERIAL_BASE }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const [fotosIa, setFotosIa] = useState<File[]>([]);
  const [iaBusy, setIaBusy] = useState(false);
  const [iaNote, setIaNote] = useState<string | null>(null);
  const fotoCameraInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaInputRef = useRef<HTMLInputElement>(null);

  function agregarFotosIa(files: File[]) {
    if (files.length === 0) return;
    setIaNote(null);
    setFotosIa((prev) => {
      const disponibles = EQUIPO_FOTO_IA_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  function quitarFotoIa(i: number) {
    setFotosIa((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function leerFotosConIa() {
    if (fotosIa.length === 0) return;
    setIaBusy(true);
    setIaNote(null);
    try {
      const fd = new FormData();
      fotosIa.forEach((f) => fd.append("fotos", f));
      const res = await fetch("/api/equipos/leer-foto", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setIaNote(data.error || "No se pudo leer las fotos.");
        return;
      }
      const detectados: {
        texto: string;
        categoriaEquipo: EquipoCategoria;
        marcaModelo: string;
        numeroSerie: string;
        etiquetaYpf: string;
        identificado: boolean;
        consumoPromedioW: number | null;
        consumoMaxW: number | null;
        posibleObsolescencia: string | null;
      }[] = data.equipos ?? [];
      if (detectados.length === 0) {
        setIaNote("No se detectó ningún material/equipo en las fotos — probá con otras o cargalo a mano.");
        return;
      }
      setMateriales((prev) => [
        ...prev.filter((m) => m.descripcion.trim() !== ""),
        ...detectados.map((d) => ({
          ...MATERIAL_BASE,
          categoriaEquipo: d.categoriaEquipo,
          descripcion: d.texto,
          marcaModelo: d.marcaModelo,
          numeroSerie: d.numeroSerie,
          etiquetaYpf: d.etiquetaYpf,
          consumoPromedioW: d.consumoPromedioW,
          consumoMaxW: d.consumoMaxW,
          revisar: d.identificado !== true,
          posibleObsolescencia: d.posibleObsolescencia,
        })),
      ]);
      const sinEtiqueta = detectados.filter((d) => d.identificado !== true).length;
      setIaNote(
        `Se identificaron ${detectados.length} material${detectados.length === 1 ? "" : "es"}` +
          (sinEtiqueta > 0 ? ` — ${sinEtiqueta} sin etiqueta legible, marcados para revisar.` : " — revisá antes de guardar.") +
          " Completá la cantidad de cada uno a mano.",
      );
      setFotosIa([]);
    } catch (err) {
      setIaNote("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo fotos de alta de material con IA", "leer-foto-alta-material");
    } finally {
      setIaBusy(false);
    }
  }

  function actualizar(i: number, patch: Partial<MaterialAltaItem>) {
    setMateriales((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function agregar() {
    setMateriales((prev) => [...prev, { ...MATERIAL_BASE }]);
  }
  function quitar(i: number) {
    setMateriales((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    setError(null);
    setExito(null);
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }
    if (!ubicacionId) {
      setError("Elegí o creá el sitio destino.");
      return;
    }
    if (materiales.every((m) => !m.descripcion.trim())) {
      setError("Cargá al menos un material.");
      return;
    }

    setBusy(true);
    const res = await darDeAltaMaterialesAction({
      ubicacionId: ubicacionId === "__new" ? null : ubicacionId,
      ubicacionNueva:
        ubicacionId === "__new"
          ? { provincia: provinciaFiltro, localidad: localidadNueva, sitio: sitioNueva, planta: plantaNueva, oficina: oficinaNueva }
          : null,
      gps,
      fecha,
      materiales: materiales.map((m) => ({
        categoriaEquipo: m.categoriaEquipo,
        descripcion: m.descripcion,
        marcaModelo: m.marcaModelo,
        numeroSerie: m.numeroSerie,
        etiquetaYpf: m.etiquetaYpf,
        cantidad: m.cantidad,
        consumoPromedioW: m.consumoPromedioW,
        consumoMaxW: m.consumoMaxW,
        tipoMontaje: m.tipoMontaje,
        alturaMontajeM: m.alturaMontajeM,
      })),
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo dar de alta.");
      return;
    }
    setExito(`Se dio de alta ${res.cantidadDadaDeAlta} material${res.cantidadDadaDeAlta === 1 ? "" : "es"}.`);
    setMateriales([{ ...MATERIAL_BASE }]);
    setUbicacionId("");
    setSitioNueva("");
    setPlantaNueva("");
    setOficinaNueva("");
    setLocalidadNueva("");
    router.refresh();
  }

  return (
    <div className="card">
      <div className="section-label">Dar de alta un material</div>
      <p className="empty-note" style={{ marginBottom: 12 }}>
        Lo que sacás de depósito para instalar — cargalo ahora, con lo que tenés en la mano. Después, en el Informe Técnico, lo
        buscás y lo adjuntás sin volver a tipear nada.
      </p>

      <UbicacionFields
        ubicaciones={ubicaciones}
        provincias={provincias}
        provinciaFiltro={provinciaFiltro}
        onProvinciaFiltroChange={setProvinciaFiltro}
        ubicacionId={ubicacionId}
        onUbicacionIdChange={setUbicacionId}
        localidadNueva={localidadNueva}
        onLocalidadNuevaChange={setLocalidadNueva}
        sitioNueva={sitioNueva}
        onSitioNuevaChange={setSitioNueva}
        plantaNueva={plantaNueva}
        onPlantaNuevaChange={setPlantaNueva}
        oficinaNueva={oficinaNueva}
        onOficinaNuevaChange={setOficinaNueva}
        onGpsCapturado={setGps}
        disabled={busy}
      />

      <div className="field" style={{ maxWidth: 200, marginTop: 12 }}>
        <label>Fecha</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
      </div>

      <div className="hint" style={{ margin: "12px 0" }}>
        <Icon name="ai" size={13} /> Sacale hasta {EQUIPO_FOTO_IA_MAX} fotos al material (podés sacar fotos de varios materiales
        distintos de una sola vez) y la IA completa categoría, marca/modelo y N° de serie — revisá y completá la cantidad antes
        de guardar. También podés cargarlo a mano más abajo.
      </div>
      <input
        ref={fotoCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          agregarFotosIa(files);
        }}
      />
      <input
        ref={fotoGaleriaInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          agregarFotosIa(files);
        }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: fotosIa.length ? 8 : 12 }}>
        <button
          type="button"
          className="ai-btn"
          onClick={() => fotoCameraInputRef.current?.click()}
          disabled={busy || iaBusy || fotosIa.length >= EQUIPO_FOTO_IA_MAX}
        >
          <Icon name="camera" size={13} /> Sacar foto ({fotosIa.length}/{EQUIPO_FOTO_IA_MAX})
        </button>
        <button
          type="button"
          className="ai-btn"
          onClick={() => fotoGaleriaInputRef.current?.click()}
          disabled={busy || iaBusy || fotosIa.length >= EQUIPO_FOTO_IA_MAX}
        >
          <Icon name="upload" size={13} /> Subir foto
        </button>
        {fotosIa.length > 0 && (
          <button type="button" className="ai-btn" onClick={() => void leerFotosConIa()} disabled={busy || iaBusy}>
            <Icon name="ai" size={13} /> {iaBusy ? "Procesando..." : `Procesar ${fotosIa.length} foto${fotosIa.length === 1 ? "" : "s"} con IA`}
          </button>
        )}
      </div>
      {fotosIa.length > 0 && (
        <div className="chip-row" style={{ marginTop: 0, marginBottom: 12 }}>
          {fotosIa.map((f, i) => (
            <span className="chip" key={i}>
              Foto {i + 1}
              <button type="button" onClick={() => quitarFotoIa(i)} disabled={iaBusy} aria-label={`Quitar foto ${i + 1}`}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {iaNote && (
        <div className="ai-note" style={{ marginBottom: 12 }}>
          <span>{iaNote}</span>
        </div>
      )}

      <div className="item-list" style={{ marginTop: 12 }}>
        {materiales.map((m, i) => (
          <div className="list-item" key={i} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            {m.revisar && (
              <div className="hint" style={{ color: "var(--warn)", margin: 0 }}>
                <Icon name="warning" size={12} /> Sin etiqueta legible en la foto — revisá y corregí lo que no coincida.
              </div>
            )}
            {m.posibleObsolescencia && (
              <div className="hint" style={{ color: "var(--warn)", margin: 0 }}>
                <Icon name="warning" size={12} /> {m.posibleObsolescencia}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 0, width: 170 }}>
                <label style={{ fontSize: 11 }}>Categoría</label>
                <select value={m.categoriaEquipo} onChange={(e) => actualizar(i, { categoriaEquipo: e.target.value as EquipoCategoria })} disabled={busy}>
                  {CATEGORIA_EQUIPO_OPCIONES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORIA_EQUIPO_LABEL[cat]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                <label style={{ fontSize: 11 }}>Descripción</label>
                <input
                  type="text"
                  placeholder="Ej: Cámara domo IP 4MP"
                  value={m.descripcion}
                  onChange={(e) => actualizar(i, { descripcion: e.target.value, revisar: false })}
                  disabled={busy}
                />
              </div>
              <div className="field" style={{ marginBottom: 0, width: 80 }}>
                <label style={{ fontSize: 11 }}>Cantidad</label>
                <input type="number" min={1} value={m.cantidad} onChange={(e) => actualizar(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })} disabled={busy} />
              </div>
              {materiales.length > 1 && (
                <button type="button" className="remove-btn" onClick={() => quitar(i)} disabled={busy}>
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 0, width: 150 }}>
                <label style={{ fontSize: 11 }}>Marca/Modelo</label>
                <input type="text" placeholder="Opcional" value={m.marcaModelo} onChange={(e) => actualizar(i, { marcaModelo: e.target.value })} disabled={busy} />
              </div>
              <div className="field" style={{ marginBottom: 0, width: 150 }}>
                <label style={{ fontSize: 11 }}>N° de Serie</label>
                <input type="text" placeholder="Opcional" value={m.numeroSerie} onChange={(e) => actualizar(i, { numeroSerie: e.target.value })} disabled={busy} />
              </div>
              <div className="field" style={{ marginBottom: 0, width: 110 }}>
                <label style={{ fontSize: 11 }}>Etiqueta YPF</label>
                <input type="text" placeholder="N° inventario" value={m.etiquetaYpf} onChange={(e) => actualizar(i, { etiquetaYpf: e.target.value })} disabled={busy} />
              </div>
            </div>

            {m.categoriaEquipo === "camara_cctv" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ marginBottom: 0, width: 150 }}>
                  <label style={{ fontSize: 11 }}>
                    Montaje <span className="opt">(opcional)</span>
                  </label>
                  <select value={m.tipoMontaje ?? ""} onChange={(e) => actualizar(i, { tipoMontaje: (e.target.value || null) as MaterialAltaItem["tipoMontaje"] })} disabled={busy}>
                    <option value="">—</option>
                    {TIPO_MONTAJE_OPCIONES.map((t) => (
                      <option key={t} value={t}>
                        {TIPO_MONTAJE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0, width: 110 }}>
                  <label style={{ fontSize: 11 }}>
                    Altura (m) <span className="opt">(opcional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    placeholder="Ej: 12"
                    value={m.alturaMontajeM ?? ""}
                    onChange={(e) => actualizar(i, { alturaMontajeM: e.target.value === "" ? null : Number(e.target.value) })}
                    disabled={busy}
                  />
                </div>
                {(() => {
                  const recurso = calcularRecursoAltura(m.tipoMontaje, m.alturaMontajeM, recursoAlturaConfig);
                  return recurso ? (
                    <span className="chip">
                      <Icon name="wrench" size={11} /> Recurso: {recurso}
                    </span>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-secondary btn-sm" onClick={agregar} disabled={busy} style={{ marginTop: 10 }}>
        <Icon name="plus" size={13} /> Agregar otro material
      </button>

      {error && (
        <div className="error-text" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      {exito && (
        <div className="hint" style={{ marginTop: 12, color: "var(--ok)" }}>
          <Icon name="check" size={13} /> {exito}
        </div>
      )}
      <button type="button" className="btn btn-primary" onClick={guardar} disabled={busy} style={{ marginTop: 12 }}>
        {busy ? "Guardando..." : "Dar de alta"}
      </button>
    </div>
  );
}
