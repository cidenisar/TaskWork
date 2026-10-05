"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import { crearInstalacionAction } from "@/app/(app)/instalacion/nueva/actions";
import { INSTALACION_FOTO_IA_MAX, MATERIAL_INSTALADO_BASE, type MaterialInstaladoItem, type RemitoItem } from "./types";
import { ErrorNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { reportarErrorCliente } from "@/lib/client-error-report";
import type { Ubicacion } from "@/components/ubicaciones/types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Informe de Instalación: materiales instalados en un sitio a partir de un
 * remito de depósito en papel. Dos listas independientes — "lo que instalé"
 * (fotos + IA, mismo endpoint que Entregas a Depósito) y "lo que decía el
 * remito" (foto + IA lee la tabla) — el técnico ajusta la cantidad
 * sobrante de cada línea del remito que no terminó instalada; eso genera
 * sola la devolución a depósito al guardar.
 */
export function NuevaInstalacionForm({ provincias, ubicaciones }: { provincias: string[]; ubicaciones: Ubicacion[] }) {
  const [provinciaFiltro, setProvinciaFiltro] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [localidadNueva, setLocalidadNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [plantaNueva, setPlantaNueva] = useState("");
  const [oficinaNueva, setOficinaNueva] = useState("");
  const [gps, setGps] = useState<GpsCapturado | null>(null);
  const [fecha, setFecha] = useState(hoyISO);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ numeroGeneracion: string; entregaDepositoNumeroGeneracion?: string } | null>(null);

  // Materiales instalados (fotos + IA, igual que Entregas a Depósito)
  const [materiales, setMateriales] = useState<MaterialInstaladoItem[]>([]);
  const [fotosIa, setFotosIa] = useState<File[]>([]);
  const [iaBusy, setIaBusy] = useState(false);
  const [iaNote, setIaNote] = useState<string | null>(null);
  const fotoCameraInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaInputRef = useRef<HTMLInputElement>(null);

  // Remito (una foto, la IA la lee como lista)
  const [remitoFoto, setRemitoFoto] = useState<File | null>(null);
  const [remitoNumero, setRemitoNumero] = useState("");
  const [remitoItems, setRemitoItems] = useState<RemitoItem[]>([]);
  const [remitoBusy, setRemitoBusy] = useState(false);
  const [remitoNote, setRemitoNote] = useState<string | null>(null);
  const remitoCameraInputRef = useRef<HTMLInputElement>(null);
  const remitoGaleriaInputRef = useRef<HTMLInputElement>(null);
  const remitoFotoPreview = useMemo(() => (remitoFoto ? URL.createObjectURL(remitoFoto) : null), [remitoFoto]);
  useEffect(() => {
    return () => {
      if (remitoFotoPreview) URL.revokeObjectURL(remitoFotoPreview);
    };
  }, [remitoFotoPreview]);

  function elegirProvinciaFiltro(p: string) {
    setProvinciaFiltro(p);
    setLocalidadNueva("");
    setSitioNueva("");
    setPlantaNueva("");
    setOficinaNueva("");
  }

  function elegirUbicacion(id: string) {
    setUbicacionId(id);
    if (id !== "__new") {
      setLocalidadNueva("");
      setSitioNueva("");
      setPlantaNueva("");
      setOficinaNueva("");
    }
  }

  // --- Materiales instalados ---

  function agregarFotosIa(files: File[]) {
    if (files.length === 0) return;
    setIaNote(null);
    setFotosIa((prev) => {
      const disponibles = INSTALACION_FOTO_IA_MAX - prev.length;
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
          fd.append("fotos", jpeg, "instalado.jpg");
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
      const res = await fetch("/api/entregas-deposito/leer-foto", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setIaNote(data.error || "No se pudo leer las fotos.");
        setFotosIa(fallidas);
        return;
      }
      const detectados: {
        descripcion: string;
        categoriaLabel: string;
        marcaModelo: string;
        numeroSerie: string;
        etiquetaYpf: string;
        identificado: boolean;
      }[] = data.items ?? [];
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
          ...MATERIAL_INSTALADO_BASE,
          descripcion: d.descripcion,
          categoria: d.categoriaLabel,
          marcaModelo: d.marcaModelo,
          numeroSerie: d.numeroSerie,
          etiquetaYpf: d.etiquetaYpf,
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
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo fotos de instalación con IA", "leer-foto-instalacion");
    } finally {
      setIaBusy(false);
    }
  }

  function agregarMaterial() {
    setMateriales((prev) => [...prev, { ...MATERIAL_INSTALADO_BASE, descripcion: "", revisar: false }]);
  }

  function actualizarMaterial(i: number, patch: Partial<MaterialInstaladoItem>) {
    setMateriales((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function quitarMaterial(i: number) {
    setMateriales((prev) => prev.filter((_, idx) => idx !== i));
  }

  // --- Remito ---

  async function leerRemitoConIa() {
    if (!remitoFoto) return;
    setRemitoBusy(true);
    setRemitoNote(null);
    try {
      const jpeg = await resizeImageToJpeg(remitoFoto);
      const fd = new FormData();
      fd.append("foto", jpeg, "remito.jpg");
      const res = await fetch("/api/instalacion/leer-remito", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setRemitoNote(data.error || "No se pudo leer el remito.");
        return;
      }
      const detectados: { descripcion: string; cantidad: number }[] = data.items ?? [];
      if (detectados.length === 0) {
        setRemitoNote(data.error || "No se detectó ninguna línea en el remito — cargala a mano.");
        return;
      }
      if (data.remitoNumero) setRemitoNumero(data.remitoNumero);
      setRemitoItems((prev) => [
        ...prev,
        ...detectados.map((d) => ({ descripcion: d.descripcion, cantidadEsperada: d.cantidad, cantidadSobrante: 0 })),
      ]);
      setRemitoNote(`Se leyeron ${detectados.length} línea${detectados.length === 1 ? "" : "s"} del remito — revisalas antes de guardar.`);
    } catch (err) {
      setRemitoNote("No se pudo leer el remito.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo remito con IA", "leer-remito-instalacion");
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

  async function crear() {
    if (!ubicacionId) {
      setError("Elegí o creá el sitio donde se instaló.");
      return;
    }
    if (ubicacionId === "__new" && (!provinciaFiltro.trim() || !sitioNueva.trim())) {
      setError("Completá la provincia y el sitio de la ubicación nueva.");
      return;
    }
    if (materiales.length === 0) {
      setError("Agregá al menos un material instalado.");
      return;
    }
    if (materiales.some((m) => !m.descripcion.trim())) {
      setError("Completá la descripción de todos los materiales instalados.");
      return;
    }
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          ubicacionId: ubicacionId === "__new" ? null : ubicacionId,
          ubicacionNueva:
            ubicacionId === "__new"
              ? { provincia: provinciaFiltro, localidad: localidadNueva, sitio: sitioNueva, planta: plantaNueva, oficina: oficinaNueva }
              : null,
          gps,
          fecha,
          materiales: materiales.map((m) => ({
            descripcion: m.descripcion.trim(),
            categoria: m.categoria.trim(),
            marcaModelo: m.marcaModelo.trim(),
            numeroSerie: m.numeroSerie.trim(),
            etiquetaYpf: m.etiquetaYpf.trim(),
            cantidad: m.cantidad,
            comentario: m.comentario.trim(),
          })),
          remitoNumero: remitoNumero.trim() || null,
          remitoItems: remitoItems.map((r) => ({
            descripcion: r.descripcion.trim(),
            cantidadEsperada: r.cantidadEsperada,
            cantidadSobrante: r.cantidadSobrante,
          })),
        }),
      );
      if (remitoFoto) {
        const jpeg = await resizeImageToJpeg(remitoFoto);
        fd.append("remitoFoto", jpeg, "remito.jpg");
      }
      const res = await crearInstalacionAction(fd);
      if (!res.success || !res.numeroGeneracion) {
        setError(res.error || "No se pudo registrar la instalación.");
        return;
      }
      setResultado({ numeroGeneracion: res.numeroGeneracion, entregaDepositoNumeroGeneracion: res.entregaDepositoNumeroGeneracion });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "No se pudo leer alguna de las fotos.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "crear-instalacion");
    } finally {
      setSubmitting(false);
    }
  }

  function empezarOtra() {
    setResultado(null);
    setProvinciaFiltro("");
    setUbicacionId("");
    setLocalidadNueva("");
    setSitioNueva("");
    setPlantaNueva("");
    setOficinaNueva("");
    setGps(null);
    setFecha(hoyISO());
    setMateriales([]);
    setFotosIa([]);
    setIaNote(null);
    setRemitoFoto(null);
    setRemitoNumero("");
    setRemitoItems([]);
    setRemitoNote(null);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Nueva Instalación</h1>
        <p>Materiales instalados a partir de un remito de depósito — lo que sobra se devuelve solo</p>
      </div>

      <div className="card">
        <div className="section-label">Sitio donde se instaló</div>
        <UbicacionFields
          ubicaciones={ubicaciones}
          provincias={provincias}
          provinciaFiltro={provinciaFiltro}
          onProvinciaFiltroChange={elegirProvinciaFiltro}
          ubicacionId={ubicacionId}
          onUbicacionIdChange={elegirUbicacion}
          localidadNueva={localidadNueva}
          onLocalidadNuevaChange={setLocalidadNueva}
          sitioNueva={sitioNueva}
          onSitioNuevaChange={setSitioNueva}
          plantaNueva={plantaNueva}
          onPlantaNuevaChange={setPlantaNueva}
          oficinaNueva={oficinaNueva}
          onOficinaNuevaChange={setOficinaNueva}
          onGpsCapturado={setGps}
          disabled={submitting}
        />
      </div>

      {ubicacionId && (
        <div className="card">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              Fecha <span className="req">*</span>
            </label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} style={{ maxWidth: 220 }} />
          </div>
        </div>
      )}

      {ubicacionId && (
        <div className="card">
          <div className="section-label">Remito</div>
          <div className="hint" style={{ margin: "-4px 0 12px" }}>
            <Icon name="ai" size={13} /> Sacale una foto al remito que te entregó depósito — la IA lee la lista de materiales y
            cantidades. Después ajustá la cantidad sobrante de cada línea que no terminó instalada.
          </div>
          <input
            ref={remitoCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (file) setRemitoFoto(file);
            }}
          />
          <input
            ref={remitoGaleriaInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (file) setRemitoFoto(file);
            }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            {remitoFoto && remitoFotoPreview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- preview local, no vale la pena next/image acá */}
                <img
                  src={remitoFotoPreview}
                  alt=""
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--field-border)" }}
                />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRemitoFoto(null)} disabled={submitting || remitoBusy}>
                  <Icon name="x" size={12} /> Quitar
                </button>
                <button type="button" className="ai-btn" onClick={() => void leerRemitoConIa()} disabled={submitting || remitoBusy}>
                  <Icon name="ai" size={13} /> {remitoBusy ? "Leyendo..." : "Leer remito con IA"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="ai-btn" onClick={() => remitoCameraInputRef.current?.click()} disabled={submitting}>
                  <Icon name="camera" size={13} /> Sacar foto
                </button>
                <button type="button" className="ai-btn" onClick={() => remitoGaleriaInputRef.current?.click()} disabled={submitting}>
                  <Icon name="upload" size={13} /> Subir foto
                </button>
              </>
            )}
          </div>
          {remitoNote && (
            <div className="ai-note" style={{ marginBottom: 12 }}>
              <span>{remitoNote}</span>
            </div>
          )}

          <div className="field" style={{ marginBottom: 12, maxWidth: 260 }}>
            <label style={{ fontSize: 11 }}>N° de Remito</label>
            <input
              type="text"
              placeholder="Opcional"
              value={remitoNumero}
              onChange={(e) => setRemitoNumero(e.target.value)}
              disabled={submitting}
            />
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
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 110 }}>
                    <label style={{ fontSize: 11 }}>Cant. remito</label>
                    <input
                      type="number"
                      min={1}
                      value={r.cantidadEsperada}
                      onChange={(e) => actualizarLineaRemito(i, { cantidadEsperada: Math.max(1, Number(e.target.value) || 1) })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 110 }}>
                    <label style={{ fontSize: 11 }}>Cant. sobrante</label>
                    <input
                      type="number"
                      min={0}
                      value={r.cantidadSobrante}
                      onChange={(e) => actualizarLineaRemito(i, { cantidadSobrante: Math.max(0, Number(e.target.value) || 0) })}
                      disabled={submitting}
                    />
                  </div>
                  <button type="button" className="remove-btn" onClick={() => quitarLineaRemito(i)} disabled={submitting}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={agregarLineaRemito} disabled={submitting} style={{ marginTop: 10 }}>
            <Icon name="plus" size={13} /> Agregar línea manual
          </button>
          {totalSobrante > 0 && (
            <div className="hint" style={{ marginTop: 10, color: "var(--warn)" }}>
              <Icon name="truck" size={12} /> Al guardar se va a generar una devolución a depósito con {totalSobrante} unidad
              {totalSobrante === 1 ? "" : "es"} sobrante{totalSobrante === 1 ? "" : "s"}.
            </div>
          )}
        </div>
      )}

      {ubicacionId && (
        <div className="card">
          <div className="section-label">Materiales instalados</div>
          <div className="hint" style={{ margin: "-4px 0 12px" }}>
            <Icon name="ai" size={13} /> Sacale hasta {INSTALACION_FOTO_IA_MAX} fotos a lo que instalaste (cámaras, domos, UPS,
            tableros, lo que sea) y la IA identifica qué es cada uno y arma la lista — podés sacar fotos de varios materiales
            distintos de una sola vez. Siempre revisá antes de guardar, y completá la cantidad a mano.
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
              disabled={submitting || iaBusy || fotosIa.length >= INSTALACION_FOTO_IA_MAX}
            >
              <Icon name="camera" size={13} /> Sacar foto ({fotosIa.length}/{INSTALACION_FOTO_IA_MAX})
            </button>
            <button
              type="button"
              className="ai-btn"
              onClick={() => fotoGaleriaInputRef.current?.click()}
              disabled={submitting || iaBusy || fotosIa.length >= INSTALACION_FOTO_IA_MAX}
            >
              <Icon name="upload" size={13} /> Subir foto
            </button>
            {fotosIa.length > 0 && (
              <button type="button" className="ai-btn" onClick={() => void leerFotosConIa()} disabled={submitting || iaBusy}>
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
                  <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                    <label style={{ fontSize: 11 }}>Descripción</label>
                    <input
                      type="text"
                      placeholder="Ej: Cámara domo IP instalada en acceso"
                      value={m.descripcion}
                      onChange={(e) => actualizarMaterial(i, { descripcion: e.target.value, revisar: false })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 150 }}>
                    <label style={{ fontSize: 11 }}>Categoría</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={m.categoria}
                      onChange={(e) => actualizarMaterial(i, { categoria: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 80 }}>
                    <label style={{ fontSize: 11 }}>Cantidad</label>
                    <input
                      type="number"
                      min={1}
                      value={m.cantidad}
                      onChange={(e) => actualizarMaterial(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                      disabled={submitting}
                    />
                  </div>
                  <button type="button" className="remove-btn" onClick={() => quitarMaterial(i)} disabled={submitting}>
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
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 150 }}>
                    <label style={{ fontSize: 11 }}>N° de Serie</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={m.numeroSerie}
                      onChange={(e) => actualizarMaterial(i, { numeroSerie: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 110 }}>
                    <label style={{ fontSize: 11 }}>Etiqueta YPF</label>
                    <input
                      type="text"
                      placeholder="N° inventario"
                      value={m.etiquetaYpf}
                      onChange={(e) => actualizarMaterial(i, { etiquetaYpf: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                    <label style={{ fontSize: 11 }}>Comentario</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={m.comentario}
                      onChange={(e) => actualizarMaterial(i, { comentario: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={agregarMaterial} disabled={submitting} style={{ marginTop: 10 }}>
            <Icon name="plus" size={13} /> Agregar material manual
          </button>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {resultado && (
        <div className="banner" style={{ marginBottom: 16 }}>
          Instalación registrada — comprobante <b>{resultado.numeroGeneracion}</b> generado con {materiales.length} material
          {materiales.length === 1 ? "" : "es"}.
          {resultado.entregaDepositoNumeroGeneracion && (
            <>
              {" "}
              Se generó la devolución de sobrantes a depósito: <b>{resultado.entregaDepositoNumeroGeneracion}</b>.
            </>
          )}{" "}
          Lo encontrás en el <b>Historial</b>.
        </div>
      )}

      {resultado ? (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={empezarOtra}>
            + Cargar otra instalación
          </button>
        </div>
      ) : (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={crear} disabled={submitting}>
            {submitting ? "Generando..." : "Registrar instalación"}
          </button>
        </div>
      )}
    </div>
  );
}
