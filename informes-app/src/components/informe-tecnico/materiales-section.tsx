"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "@/components/icon";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { CATEGORIA_EQUIPO_OPCIONES, CATEGORIA_EQUIPO_LABEL } from "@/components/equipos/types";
import {
  MATERIAL_FOTO_IA_MAX,
  MATERIAL_INFORME_BASE,
  REMITO_FOTO_MAX,
  type MaterialInformeItem,
  type RemitoItem,
} from "./materiales-types";
import type { EquipoCategoria } from "@/lib/database.types";

/**
 * Sección opcional de "Materiales/equipos" dentro de Informe Técnico — no
 * es exclusiva de una instalación, cualquier trabajo (reparación, etc.)
 * puede haber usado materiales. Dos listas con fotos + IA independientes:
 * "Materiales instalados" (reusa /api/equipos/leer-foto, igual universo que
 * Equipos Individuales — cada uno se da de alta como equipo real al
 * guardar) y "Remito" (lee la tabla de un remito de depósito en papel). El
 * técnico ajusta la cantidad sobrante de cada línea del remito que no se
 * usó — eso genera sola la devolución a depósito al guardar el informe.
 */
export function MaterialesSection({
  materiales,
  setMateriales,
  remitoFotos,
  setRemitoFotos,
  remitoNumero,
  setRemitoNumero,
  remitoItems,
  setRemitoItems,
  disabled,
}: {
  materiales: MaterialInformeItem[];
  setMateriales: Dispatch<SetStateAction<MaterialInformeItem[]>>;
  remitoFotos: File[];
  setRemitoFotos: Dispatch<SetStateAction<File[]>>;
  remitoNumero: string;
  setRemitoNumero: Dispatch<SetStateAction<string>>;
  remitoItems: RemitoItem[];
  setRemitoItems: Dispatch<SetStateAction<RemitoItem[]>>;
  disabled: boolean;
}) {
  const [fotosIa, setFotosIa] = useState<File[]>([]);
  const [iaBusy, setIaBusy] = useState(false);
  const [iaNote, setIaNote] = useState<string | null>(null);
  const fotoCameraInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaInputRef = useRef<HTMLInputElement>(null);

  const [remitoBusy, setRemitoBusy] = useState(false);
  const [remitoNote, setRemitoNote] = useState<string | null>(null);
  const remitoCameraInputRef = useRef<HTMLInputElement>(null);
  const remitoGaleriaInputRef = useRef<HTMLInputElement>(null);

  function agregarFotosIa(files: File[]) {
    if (files.length === 0) return;
    setIaNote(null);
    setFotosIa((prev) => {
      const disponibles = MATERIAL_FOTO_IA_MAX - prev.length;
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
    const fallidas: File[] = [];
    let primerError: string | null = null;
    try {
      const fd = new FormData();
      for (const f of fotosIa) {
        try {
          const jpeg = await resizeImageToJpeg(f);
          fd.append("fotos", jpeg, "material.jpg");
        } catch (err) {
          fallidas.push(f);
          const msg = err instanceof Error ? err.message : `No se pudo leer "${f.name}".`;
          if (!primerError) primerError = msg;
        }
      }
      const exitosas = fotosIa.length - fallidas.length;
      if (exitosas === 0) {
        setIaNote(primerError || "No se pudo leer ninguna de las fotos.");
        return;
      }
      const res = await fetch("/api/equipos/leer-foto", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setIaNote(data.error || "No se pudo leer las fotos.");
        setFotosIa(fallidas);
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
      }[] = data.equipos ?? [];
      if (detectados.length === 0) {
        setIaNote(
          "No se detectó ningún material/equipo en las fotos — probá con otras o cargalo a mano." +
            (fallidas.length > 0 ? ` (${fallidas.length} foto${fallidas.length === 1 ? "" : "s"} no se pudo leer: ${primerError})` : ""),
        );
        setFotosIa(fallidas);
        return;
      }
      setMateriales((prev) => [
        ...prev,
        ...detectados.map((d) => ({
          ...MATERIAL_INFORME_BASE,
          categoriaEquipo: d.categoriaEquipo,
          descripcion: d.texto,
          marcaModelo: d.marcaModelo,
          numeroSerie: d.numeroSerie,
          etiquetaYpf: d.etiquetaYpf,
          consumoPromedioW: d.consumoPromedioW,
          consumoMaxW: d.consumoMaxW,
          revisar: d.identificado !== true,
        })),
      ]);
      const sinEtiqueta = detectados.filter((d) => d.identificado !== true).length;
      setIaNote(
        `Se identificaron ${detectados.length} material${detectados.length === 1 ? "" : "es"} desde ${exitosas} foto${exitosas === 1 ? "" : "s"}` +
          (sinEtiqueta > 0
            ? ` — ${sinEtiqueta} sin etiqueta legible, marcados para revisar.`
            : " — revisá la categoría/marca/serie antes de guardar.") +
          " Completá la cantidad de cada uno a mano." +
          (fallidas.length > 0 ? ` (${fallidas.length} foto${fallidas.length === 1 ? "" : "s"} no se pudo leer: ${primerError})` : ""),
      );
      setFotosIa(fallidas);
    } catch (err) {
      setIaNote("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo fotos de materiales con IA", "leer-foto-materiales-informe");
    } finally {
      setIaBusy(false);
    }
  }

  function agregarMaterial() {
    setMateriales((prev) => [...prev, { ...MATERIAL_INFORME_BASE, descripcion: "", revisar: false }]);
  }

  function actualizarMaterial(i: number, patch: Partial<MaterialInformeItem>) {
    setMateriales((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function quitarMaterial(i: number) {
    setMateriales((prev) => prev.filter((_, idx) => idx !== i));
  }

  function agregarFotosRemito(files: File[]) {
    if (files.length === 0) return;
    setRemitoNote(null);
    setRemitoFotos((prev) => {
      const disponibles = REMITO_FOTO_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  function quitarFotoRemito(i: number) {
    setRemitoFotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function leerRemitoConIa() {
    if (remitoFotos.length === 0) return;
    setRemitoBusy(true);
    setRemitoNote(null);
    const fallidas: File[] = [];
    let primerError: string | null = null;
    try {
      const fd = new FormData();
      for (const f of remitoFotos) {
        try {
          const jpeg = await resizeImageToJpeg(f);
          fd.append("fotos", jpeg, "remito.jpg");
        } catch (err) {
          fallidas.push(f);
          const msg = err instanceof Error ? err.message : `No se pudo leer "${f.name}".`;
          if (!primerError) primerError = msg;
        }
      }
      const exitosas = remitoFotos.length - fallidas.length;
      if (exitosas === 0) {
        setRemitoNote(primerError || "No se pudo leer ninguna de las fotos.");
        return;
      }
      const res = await fetch("/api/informe-tecnico/leer-remito", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setRemitoNote(data.error || "No se pudo leer el remito.");
        setRemitoFotos(fallidas);
        return;
      }
      const detectados: { descripcion: string; cantidad: number }[] = data.items ?? [];
      if (detectados.length === 0) {
        setRemitoNote(data.error || "No se detectó ninguna línea en el remito — cargala a mano.");
        setRemitoFotos(fallidas);
        return;
      }
      if (data.remitoNumero) setRemitoNumero(data.remitoNumero);
      setRemitoItems((prev) => [
        ...prev,
        ...detectados.map((d) => ({ descripcion: d.descripcion, cantidadEsperada: d.cantidad, cantidadSobrante: 0 })),
      ]);
      setRemitoNote(
        `Se leyeron ${detectados.length} línea${detectados.length === 1 ? "" : "s"} del remito desde ${exitosas} foto${exitosas === 1 ? "" : "s"} — revisalas antes de guardar.` +
          (fallidas.length > 0 ? ` (${fallidas.length} foto${fallidas.length === 1 ? "" : "s"} no se pudo leer: ${primerError})` : ""),
      );
      setRemitoFotos(fallidas);
    } catch (err) {
      setRemitoNote("No se pudo leer el remito.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo remito con IA", "leer-remito-informe");
    } finally {
      setRemitoBusy(false);
    }
  }

  function agregarLineaRemito() {
    setRemitoItems((prev) => [...prev, { descripcion: "", cantidadEsperada: 1, cantidadSobrante: 0 }]);
  }

  function actualizarLineaRemito(i: number, patch: Partial<RemitoItem>) {
    setRemitoItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function quitarLineaRemito(i: number) {
    setRemitoItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const totalSobrante = remitoItems.reduce((acc, r) => acc + (r.cantidadSobrante || 0), 0);

  return (
    <div>
      <div className="card">
        <div className="section-label">Remito (opcional)</div>
        <div className="hint" style={{ margin: "-4px 0 12px" }}>
          <Icon name="ai" size={13} /> Si retiraste el material de depósito con un remito en papel, sacale hasta {REMITO_FOTO_MAX}{" "}
          fotos (por ejemplo si tiene varias páginas, o para reintentar una que salió borrosa) — la IA combina todo en una sola
          lista de materiales y cantidades. Después ajustá la cantidad sobrante de lo que no terminó usado/instalado.
        </div>
        <input
          ref={remitoCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotosRemito(files);
          }}
        />
        <input
          ref={remitoGaleriaInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            agregarFotosRemito(files);
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: remitoFotos.length ? 8 : 12 }}>
          <button
            type="button"
            className="ai-btn"
            onClick={() => remitoCameraInputRef.current?.click()}
            disabled={disabled || remitoBusy || remitoFotos.length >= REMITO_FOTO_MAX}
          >
            <Icon name="camera" size={13} /> Sacar foto ({remitoFotos.length}/{REMITO_FOTO_MAX})
          </button>
          <button
            type="button"
            className="ai-btn"
            onClick={() => remitoGaleriaInputRef.current?.click()}
            disabled={disabled || remitoBusy || remitoFotos.length >= REMITO_FOTO_MAX}
          >
            <Icon name="upload" size={13} /> Subir foto
          </button>
          {remitoFotos.length > 0 && (
            <button type="button" className="ai-btn" onClick={() => void leerRemitoConIa()} disabled={disabled || remitoBusy}>
              <Icon name="ai" size={13} /> {remitoBusy ? "Leyendo..." : `Leer ${remitoFotos.length} foto${remitoFotos.length === 1 ? "" : "s"} con IA`}
            </button>
          )}
        </div>
        {remitoFotos.length > 0 && (
          <div className="chip-row" style={{ marginTop: 0, marginBottom: 12 }}>
            {remitoFotos.map((f, i) => (
              <span className="chip" key={i}>
                Foto {i + 1}
                <button type="button" onClick={() => quitarFotoRemito(i)} disabled={remitoBusy} aria-label={`Quitar foto ${i + 1}`}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {remitoNote && (
          <div className="ai-note" style={{ marginBottom: 12 }}>
            <span>{remitoNote}</span>
          </div>
        )}

        <div className="field" style={{ marginBottom: 12, maxWidth: 260 }}>
          <label style={{ fontSize: 11 }}>N° de Remito</label>
          <input type="text" placeholder="Opcional" value={remitoNumero} onChange={(e) => setRemitoNumero(e.target.value)} disabled={disabled} />
        </div>

        {remitoItems.length === 0 && <div className="empty-note">Todavía no hay líneas del remito cargadas.</div>}
        <div className="item-list" style={{ marginTop: remitoItems.length ? 0 : 12 }}>
          {remitoItems.map((r, i) => (
            <div className="list-item" key={i} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                  <label style={{ fontSize: 11 }}>Descripción (del remito)</label>
                  <input
                    type="text"
                    placeholder="Ej: Cámara domo IP 4MP"
                    value={r.descripcion}
                    onChange={(e) => actualizarLineaRemito(i, { descripcion: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 110 }}>
                  <label style={{ fontSize: 11 }}>Cant. remito</label>
                  <input
                    type="number"
                    min={1}
                    value={r.cantidadEsperada}
                    onChange={(e) => actualizarLineaRemito(i, { cantidadEsperada: Math.max(1, Number(e.target.value) || 1) })}
                    disabled={disabled}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 110 }}>
                  <label style={{ fontSize: 11 }}>Cant. sobrante</label>
                  <input
                    type="number"
                    min={0}
                    value={r.cantidadSobrante}
                    onChange={(e) => actualizarLineaRemito(i, { cantidadSobrante: Math.max(0, Number(e.target.value) || 0) })}
                    disabled={disabled}
                  />
                </div>
                <button type="button" className="remove-btn" onClick={() => quitarLineaRemito(i)} disabled={disabled}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={agregarLineaRemito} disabled={disabled} style={{ marginTop: 10 }}>
          <Icon name="plus" size={13} /> Agregar línea manual
        </button>
        {totalSobrante > 0 && (
          <div className="hint" style={{ marginTop: 10, color: "var(--warn)" }}>
            <Icon name="truck" size={12} /> Al guardar se va a generar una devolución a depósito con {totalSobrante} unidad
            {totalSobrante === 1 ? "" : "es"} sobrante{totalSobrante === 1 ? "" : "s"}.
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Materiales / equipos usados</div>
        <div className="hint" style={{ margin: "-4px 0 12px" }}>
          <Icon name="ai" size={13} /> Sacale hasta {MATERIAL_FOTO_IA_MAX} fotos a lo que usaste/instalaste (cámaras, UPS, tableros,
          lo que sea) y la IA identifica qué es cada uno — podés sacar fotos de varios materiales distintos de una sola vez. Cada
          uno queda dado de alta como equipo en este Sitio. Siempre revisá antes de guardar, y completá la cantidad a mano.
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
            disabled={disabled || iaBusy || fotosIa.length >= MATERIAL_FOTO_IA_MAX}
          >
            <Icon name="camera" size={13} /> Sacar foto ({fotosIa.length}/{MATERIAL_FOTO_IA_MAX})
          </button>
          <button
            type="button"
            className="ai-btn"
            onClick={() => fotoGaleriaInputRef.current?.click()}
            disabled={disabled || iaBusy || fotosIa.length >= MATERIAL_FOTO_IA_MAX}
          >
            <Icon name="upload" size={13} /> Subir foto
          </button>
          {fotosIa.length > 0 && (
            <button type="button" className="ai-btn" onClick={() => void leerFotosConIa()} disabled={disabled || iaBusy}>
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

        {materiales.length === 0 && <div className="empty-note">Todavía no hay materiales cargados.</div>}
        <div className="item-list" style={{ marginTop: materiales.length ? 0 : 12 }}>
          {materiales.map((m, i) => (
            <div className="list-item" key={i} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              {m.revisar && (
                <div className="hint" style={{ color: "var(--warn)", margin: 0 }}>
                  <Icon name="warning" size={12} /> Sin etiqueta legible en la foto — revisá y corregí lo que no coincida.
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ marginBottom: 0, width: 170 }}>
                  <label style={{ fontSize: 11 }}>Categoría</label>
                  <select
                    value={m.categoriaEquipo}
                    onChange={(e) => actualizarMaterial(i, { categoriaEquipo: e.target.value as EquipoCategoria })}
                    disabled={disabled}
                  >
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
                    placeholder="Ej: Cámara domo IP instalada en acceso"
                    value={m.descripcion}
                    onChange={(e) => actualizarMaterial(i, { descripcion: e.target.value, revisar: false })}
                    disabled={disabled}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 80 }}>
                  <label style={{ fontSize: 11 }}>Cantidad</label>
                  <input
                    type="number"
                    min={1}
                    value={m.cantidad}
                    onChange={(e) => actualizarMaterial(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                    disabled={disabled}
                  />
                </div>
                <button type="button" className="remove-btn" onClick={() => quitarMaterial(i)} disabled={disabled}>
                  <Icon name="x" size={12} />
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ marginBottom: 0, width: 150 }}>
                  <label style={{ fontSize: 11 }}>Marca/Modelo</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={m.marcaModelo}
                    onChange={(e) => actualizarMaterial(i, { marcaModelo: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 150 }}>
                  <label style={{ fontSize: 11 }}>N° de Serie</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={m.numeroSerie}
                    onChange={(e) => actualizarMaterial(i, { numeroSerie: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 110 }}>
                  <label style={{ fontSize: 11 }}>Etiqueta YPF</label>
                  <input
                    type="text"
                    placeholder="N° inventario"
                    value={m.etiquetaYpf}
                    onChange={(e) => actualizarMaterial(i, { etiquetaYpf: e.target.value })}
                    disabled={disabled}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 11 }}>Comentario</label>
                  <input
                    type="text"
                    placeholder="Opcional"
                    value={m.comentario}
                    onChange={(e) => actualizarMaterial(i, { comentario: e.target.value })}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={agregarMaterial} disabled={disabled} style={{ marginTop: 10 }}>
          <Icon name="plus" size={13} /> Agregar material manual
        </button>
      </div>
    </div>
  );
}
