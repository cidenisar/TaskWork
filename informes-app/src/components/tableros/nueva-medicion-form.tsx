"use client";

import { useMemo, useRef, useState } from "react";
import { crearMedicionTableroAction } from "@/app/(app)/tableros/nuevo/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import type { TableroCategoriaEquipo, TableroEventoTipo, TableroTipo, TableroTipoCircuito } from "@/lib/database.types";
import {
  TABLERO_TIPOS,
  TABLERO_TIPO_LABEL,
  TABLERO_EVENTO_LABEL,
  TABLERO_FOTO_IA_MAX,
  CATEGORIA_EQUIPO_OPCIONES,
  CATEGORIA_EQUIPO_LABEL,
  TIPO_CIRCUITO_OPCIONES,
  TIPO_CIRCUITO_LABEL,
  ESTADO_OPCIONES,
  categoriaLlevaAmp,
  itemMideCorriente,
  fasesMedicion,
  labelSubsistemas,
  calcularResumenEquipamiento,
  type CircuitoItem,
  type TableroConCircuitos,
} from "./types";

interface LecturaState {
  estado: string;
  corrienteF: string;
  corrienteR: string;
  corrienteS: string;
  corrienteT: string;
  comentario: string;
}

const LECTURA_VACIA: LecturaState = { estado: "", corrienteF: "", corrienteR: "", corrienteS: "", corrienteT: "", comentario: "" };
const CIRCUITO_NUEVO_BASE = { categoriaEquipo: "otro" as TableroCategoriaEquipo, tipoCircuito: "na" as TableroTipoCircuito };

function toggleEnArray<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function NuevaMedicionForm({ tableros }: { tableros: TableroConCircuitos[] }) {
  const [filtroSubsistemas, setFiltroSubsistemas] = useState<TableroTipo[]>([]);
  const [tableroId, setTableroId] = useState<string>(""); // "" = sin elegir, "__new" = crear
  const [subsistemasNuevo, setSubsistemasNuevo] = useState<TableroTipo[]>([]);
  const [denominacionNueva, setDenominacionNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [tipoEventoElegido, setTipoEventoElegido] = useState<TableroEventoTipo>("medicion");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [circuitos, setCircuitos] = useState<CircuitoItem[]>([]);
  const [lecturas, setLecturas] = useState<Record<number, LecturaState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ numeroGeneracion: string; pdfUrl: string | null } | null>(null);
  const [fotosIa, setFotosIa] = useState<File[]>([]);
  const [iaBusy, setIaBusy] = useState(false);
  const [iaNote, setIaNote] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const tablerosFiltrados = useMemo(
    () =>
      filtroSubsistemas.length === 0
        ? tableros
        : tableros.filter((t) => filtroSubsistemas.some((s) => t.subsistemas.includes(s))),
    [tableros, filtroSubsistemas],
  );
  const tableroExistente = useMemo(() => tableros.find((t) => t.id === tableroId) ?? null, [tableros, tableroId]);
  const subsistemasActuales = tableroId === "__new" ? subsistemasNuevo : (tableroExistente?.subsistemas ?? []);
  const tieneEnergia = subsistemasActuales.includes("energia");
  // Solo si el tablero tiene energía tiene sentido distinguir medición de
  // relevamiento — CCTV/Control de Acceso puros siempre son relevamiento
  // (nunca miden corriente).
  const tipoEvento: TableroEventoTipo = tieneEnergia ? tipoEventoElegido : "relevamiento";
  const resumen = useMemo(() => calcularResumenEquipamiento(circuitos), [circuitos]);

  function elegirTablero(id: string) {
    setTableroId(id);
    setSuccess(null);
    if (id === "__new") {
      setSubsistemasNuevo([]);
      setCircuitos([]);
      setLecturas({});
      return;
    }
    if (id === "") {
      setCircuitos([]);
      setLecturas({});
      return;
    }
    const t = tableros.find((x) => x.id === id);
    setCircuitos(t ? [...t.circuitos] : []);
    setLecturas({});
  }

  function agregarFotoIa(file: File | undefined) {
    if (!file) return;
    setIaNote(null);
    setFotosIa((prev) => (prev.length >= TABLERO_FOTO_IA_MAX ? prev : [...prev, file]));
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
      for (const f of fotosIa) {
        const jpeg = await resizeImageToJpeg(f);
        fd.append("fotos", jpeg, "tablero.jpg");
      }
      fd.append("subsistemas", subsistemasActuales.join(","));
      const res = await fetch("/api/tableros/leer-foto", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setIaNote(data.error || "No se pudo leer las fotos.");
        return;
      }
      const detectados: {
        numero: number;
        texto: string;
        ampNominal: string;
        categoriaEquipo: TableroCategoriaEquipo;
        tipoCircuito: TableroTipoCircuito;
        identificado: boolean;
        estadoDetectado: string | null;
      }[] = data.circuitos ?? [];
      if (detectados.length === 0) {
        setIaNote("No se detectó ningún circuito/elemento en las fotos — probá con otras o cargalos a mano.");
        return;
      }
      const siguienteBase = circuitos.length ? Math.max(...circuitos.map((c) => c.numero)) : 0;
      const baseIndex = circuitos.length;
      setCircuitos((prev) => [
        ...prev,
        ...detectados.map((d, i) => ({
          id: null,
          numero: siguienteBase + i + 1,
          texto: d.texto,
          ampNominal: d.ampNominal,
          categoriaEquipo: d.categoriaEquipo,
          tipoCircuito: d.tipoCircuito,
          revisar: d.identificado !== true,
        })),
      ]);
      setLecturas((prev) => {
        const next = { ...prev };
        detectados.forEach((d, i) => {
          if (d.estadoDetectado) {
            next[baseIndex + i] = { ...(next[baseIndex + i] ?? LECTURA_VACIA), estado: d.estadoDetectado };
          }
        });
        return next;
      });
      const sinEtiqueta = detectados.filter((d) => d.identificado !== true).length;
      const conEstado = detectados.filter((d) => d.estadoDetectado).length;
      setIaNote(
        `Se agregaron ${detectados.length} elemento${detectados.length === 1 ? "" : "s"} desde ${fotosIa.length} foto${fotosIa.length === 1 ? "" : "s"}` +
          (sinEtiqueta > 0
            ? ` — ${sinEtiqueta} sin etiqueta legible, marcados para revisar (la IA describió y clasificó lo que vio, pero no adivina el nombre del circuito sin una etiqueta física).`
            : " — revisá la categoría/tipo de circuito antes de guardar.") +
          (conEstado > 0
            ? ` El estado de ${conEstado} térmica${conEstado === 1 ? "" : "s"}/disyuntor${conEstado === 1 ? "" : "es"} se precargó según la posición de la palanca — confirmalo.`
            : ""),
      );
      setFotosIa([]);
    } catch (err) {
      setIaNote("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo fotos de tablero con IA", "leer-foto-tablero");
    } finally {
      setIaBusy(false);
    }
  }

  function agregarCircuito() {
    const siguienteNumero = circuitos.length ? Math.max(...circuitos.map((c) => c.numero)) + 1 : 1;
    setCircuitos((prev) => [...prev, { id: null, numero: siguienteNumero, texto: "", ampNominal: "", ...CIRCUITO_NUEVO_BASE }]);
  }

  function actualizarCircuito(i: number, patch: Partial<CircuitoItem>) {
    setCircuitos((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function quitarCircuito(i: number) {
    setCircuitos((prev) => prev.filter((_, idx) => idx !== i));
    setLecturas((prev) => {
      const next: Record<number, LecturaState> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const idx = Number(k);
        if (idx < i) next[idx] = v;
        else if (idx > i) next[idx - 1] = v;
      });
      return next;
    });
  }

  function actualizarLectura(i: number, patch: Partial<LecturaState>) {
    setLecturas((prev) => ({ ...prev, [i]: { ...(prev[i] ?? LECTURA_VACIA), ...patch } }));
  }

  async function guardar() {
    setError(null);
    if (!tableroId) {
      setError("Elegí un tablero existente o creá uno nuevo.");
      return;
    }
    if (tableroId === "__new" && (!denominacionNueva.trim() || !sitioNueva.trim())) {
      setError("Completá la denominación y el sitio del tablero nuevo.");
      return;
    }
    if (tableroId === "__new" && subsistemasNuevo.length === 0) {
      setError("Elegí al menos un subsistema presente en el tablero nuevo.");
      return;
    }
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }
    if (circuitos.length === 0) {
      setError("Agregá al menos un circuito/elemento.");
      return;
    }
    const circuitosSinTexto = circuitos.some((c) => !c.texto.trim());
    if (circuitosSinTexto) {
      setError("Completá el texto de todos los circuitos/elementos cargados.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await crearMedicionTableroAction({
        subsistemas: subsistemasActuales,
        tipoEvento,
        tableroId: tableroId === "__new" ? null : tableroId,
        denominacionNueva,
        sitioNuevo: sitioNueva,
        fecha,
        lecturas: circuitos.map((c, i) => {
          const l = lecturas[i] ?? LECTURA_VACIA;
          return {
            circuitoId: c.id,
            numero: c.numero,
            texto: c.texto.trim(),
            ampNominal: c.ampNominal.trim(),
            categoriaEquipo: c.categoriaEquipo,
            tipoCircuito: c.tipoCircuito,
            estado: l.estado,
            corrienteF: l.corrienteF,
            corrienteR: l.corrienteR,
            corrienteS: l.corrienteS,
            corrienteT: l.corrienteT,
            comentario: l.comentario,
          };
        }),
      });
      if (!res.success) {
        const mensaje = res.error || "No se pudo guardar la medición.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "crear-medicion-tablero");
        return;
      }
      setSuccess({ numeroGeneracion: res.numeroGeneracion!, pdfUrl: res.pdfUrl ?? null });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado guardando la medición.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "crear-medicion-tablero", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  function empezarOtra() {
    setSuccess(null);
    setTableroId("");
    setSubsistemasNuevo([]);
    setDenominacionNueva("");
    setSitioNueva("");
    setCircuitos([]);
    setLecturas({});
  }

  return (
    <div>
      <div className="page-heading">
        <h1>{tipoEvento === "medicion" ? "Nueva Medición" : "Nuevo Relevamiento"}</h1>
        <p>Elegí el tablero, cargá la fecha y las lecturas por circuito/elemento — se genera el PDF al guardar.</p>
      </div>

      <div className="card">
        <div className="section-label">Tablero</div>
        {tableros.length > 0 && (
          <div className="field">
            <label>Filtrar por subsistema (opcional)</label>
            <div className="tech-form-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {TABLERO_TIPOS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn btn-sm ${filtroSubsistemas.includes(s) ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setFiltroSubsistemas((prev) => toggleEnArray(prev, s))}
                  disabled={submitting}
                >
                  {TABLERO_TIPO_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label>
            Elegí uno existente o creá uno nuevo <span className="req">*</span>
          </label>
          <select value={tableroId} onChange={(e) => elegirTablero(e.target.value)} disabled={submitting}>
            <option value="">Seleccionar tablero...</option>
            {tablerosFiltrados.map((t) => (
              <option key={t.id} value={t.id}>
                {t.denominacion} — {t.sitio} ({labelSubsistemas(t.subsistemas)})
              </option>
            ))}
            <option value="__new">+ Crear tablero nuevo...</option>
          </select>
        </div>
        {tableroId === "__new" && (
          <>
            <div className="grid2">
              <div className="field">
                <label>
                  Denominación <span className="req">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: TPBT ENERGIA B"
                  value={denominacionNueva}
                  onChange={(e) => setDenominacionNueva(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="field">
                <label>
                  Sitio <span className="req">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: Sala RTIC Edificio Principal"
                  value={sitioNueva}
                  onChange={(e) => setSitioNueva(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
            <div className="field">
              <label>
                Subsistemas presentes en el tablero <span className="req">*</span>
              </label>
              <div className="hint" style={{ margin: "-2px 0 8px" }}>
                Un tablero puede ser mixto — marcá todos los que correspondan.
              </div>
              <div className="tech-form-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                {TABLERO_TIPOS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn ${subsistemasNuevo.includes(s) ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setSubsistemasNuevo((prev) => toggleEnArray(prev, s))}
                    disabled={submitting}
                  >
                    {TABLERO_TIPO_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {tieneEnergia && (
          <>
            <div className="section-label" style={{ marginTop: 16 }}>
              Tipo de Visita
            </div>
            <div className="hint" style={{ margin: "-4px 0 12px" }}>
              Medición mide corriente por fase en térmicas/disyuntores; Relevamiento es un chequeo de estado más liviano, sin medir corriente.
            </div>
            <div className="tech-form-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              {(["medicion", "relevamiento"] as const).map((te) => (
                <button
                  key={te}
                  type="button"
                  className={`btn ${tipoEventoElegido === te ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setTipoEventoElegido(te)}
                  disabled={submitting}
                >
                  {TABLERO_EVENTO_LABEL[te]}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="field" style={{ marginBottom: 0, marginTop: 16 }}>
          <label>
            Fecha <span className="req">*</span>
          </label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} style={{ maxWidth: 220 }} />
        </div>
      </div>

      {tableroId && (
        <div className="card">
          <div className="section-label">Circuitos / Elementos</div>
          <div className="hint" style={{ margin: "-4px 0 12px" }}>
            <Icon name="ai" size={13} /> Sacale hasta {TABLERO_FOTO_IA_MAX} fotos al tablero (distintos ángulos o secciones) y la IA
            combina todas para armar la lista de elementos sin repetir — clasifica categoría y tipo de circuito, pero siempre revisala y
            corregí lo que haga falta antes de guardar.
          </div>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              agregarFotoIa(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: fotosIa.length ? 8 : 12 }}>
            <button
              type="button"
              className="ai-btn"
              onClick={() => fotoInputRef.current?.click()}
              disabled={submitting || iaBusy || fotosIa.length >= TABLERO_FOTO_IA_MAX}
            >
              <Icon name="camera" size={13} /> Agregar foto ({fotosIa.length}/{TABLERO_FOTO_IA_MAX})
            </button>
            {fotosIa.length > 0 && (
              <button type="button" className="ai-btn" onClick={() => void leerFotosConIa()} disabled={submitting || iaBusy}>
                <Icon name="ai" size={13} />{" "}
                {iaBusy ? "Leyendo fotos..." : `Leer ${fotosIa.length} foto${fotosIa.length === 1 ? "" : "s"} con IA`}
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

          {circuitos.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
                margin: "0 0 14px",
                padding: "10px 12px",
                border: "1.5px solid var(--field-border)",
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>
                Resumen: {resumen.total} equipamiento{resumen.total === 1 ? "" : "s"}
              </span>
              {resumen.circuitos220vMono > 0 && <span className="chip">{resumen.circuitos220vMono} · 220V mono</span>}
              {resumen.circuitos380vTri > 0 && <span className="chip">{resumen.circuitos380vTri} · 380V tri</span>}
              {resumen.porCategoria.map((c) => (
                <span className="chip" key={c.categoria}>
                  {c.cantidad} {CATEGORIA_EQUIPO_LABEL[c.categoria]}
                </span>
              ))}
            </div>
          )}

          {circuitos.length === 0 && <div className="empty-note">Todavía no hay circuitos/elementos cargados.</div>}
          <div className="item-list" style={{ marginTop: circuitos.length ? 0 : 12 }}>
            {circuitos.map((c, i) => {
              const l = lecturas[i] ?? LECTURA_VACIA;
              const esNuevo = c.id === null;
              const mideCorriente = itemMideCorriente(c.categoriaEquipo, c.tipoCircuito, tipoEvento);
              return (
                <div className="list-item" key={i} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  {esNuevo ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {c.revisar && (
                        <div className="hint" style={{ color: "var(--warn)", margin: 0 }}>
                          <Icon name="warning" size={12} /> Sin etiqueta legible en la foto — la IA describió/clasificó lo que vio,
                          corregí lo que no coincida.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div className="field" style={{ marginBottom: 0, width: 60 }}>
                          <label style={{ fontSize: 11 }}>N°</label>
                          <input
                            type="number"
                            value={c.numero}
                            onChange={(e) => actualizarCircuito(i, { numero: Number(e.target.value) || 0 })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                          <label style={{ fontSize: 11 }}>Circuito/Elemento</label>
                          <input
                            type="text"
                            placeholder="Ej: RACK 1 / Cámara Hall"
                            value={c.texto}
                            onChange={(e) => actualizarCircuito(i, { texto: e.target.value, revisar: false })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 175 }}>
                          <label style={{ fontSize: 11 }}>Categoría</label>
                          <select
                            value={c.categoriaEquipo}
                            onChange={(e) => actualizarCircuito(i, { categoriaEquipo: e.target.value as TableroCategoriaEquipo })}
                            disabled={submitting}
                          >
                            {CATEGORIA_EQUIPO_OPCIONES.map((cat) => (
                              <option key={cat} value={cat}>
                                {CATEGORIA_EQUIPO_LABEL[cat]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 150 }}>
                          <label style={{ fontSize: 11 }}>Tipo de circuito</label>
                          <select
                            value={c.tipoCircuito}
                            onChange={(e) => actualizarCircuito(i, { tipoCircuito: e.target.value as TableroTipoCircuito })}
                            disabled={submitting}
                          >
                            {TIPO_CIRCUITO_OPCIONES.map((tc) => (
                              <option key={tc} value={tc}>
                                {TIPO_CIRCUITO_LABEL[tc]}
                              </option>
                            ))}
                          </select>
                        </div>
                        {categoriaLlevaAmp(c.categoriaEquipo) && (
                          <div className="field" style={{ marginBottom: 0, width: 90 }}>
                            <label style={{ fontSize: 11 }}>Amp</label>
                            <input
                              type="text"
                              placeholder="Ej: 32A"
                              value={c.ampNominal}
                              onChange={(e) => actualizarCircuito(i, { ampNominal: e.target.value })}
                              disabled={submitting}
                            />
                          </div>
                        )}
                        <button type="button" className="remove-btn" onClick={() => quitarCircuito(i)} disabled={submitting}>
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="item-name">
                      {c.numero} — {c.texto} · {CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo]}
                      {c.tipoCircuito !== "na" ? ` · ${TIPO_CIRCUITO_LABEL[c.tipoCircuito]}` : ""}
                      {categoriaLlevaAmp(c.categoriaEquipo) && c.ampNominal ? ` (${c.ampNominal})` : ""}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div className="field" style={{ marginBottom: 0, width: 150 }}>
                      <label style={{ fontSize: 11 }}>Estado</label>
                      <select value={l.estado} onChange={(e) => actualizarLectura(i, { estado: e.target.value })} disabled={submitting}>
                        <option value="">—</option>
                        {ESTADO_OPCIONES[c.categoriaEquipo].map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    {mideCorriente && (
                      <>
                        {fasesMedicion(c.tipoCircuito).map((fase) => {
                          const key = (`corriente${fase}` as const);
                          return (
                            <div className="field" style={{ marginBottom: 0, width: 70 }} key={fase}>
                              <label style={{ fontSize: 11 }}>{fase} (A)</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={l[key]}
                                onChange={(e) => actualizarLectura(i, { [key]: e.target.value } as Partial<LecturaState>)}
                                disabled={submitting}
                              />
                            </div>
                          );
                        })}
                      </>
                    )}
                    <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                      <label style={{ fontSize: 11 }}>Comentario</label>
                      <input
                        type="text"
                        placeholder="Opcional"
                        value={l.comentario}
                        onChange={(e) => actualizarLectura(i, { comentario: e.target.value })}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={agregarCircuito} disabled={submitting} style={{ marginTop: 10 }}>
            <Icon name="plus" size={13} /> Agregar circuito/elemento
          </button>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {success && (
        <>
          <SuccessNote>
            {TABLERO_EVENTO_LABEL[tipoEvento]} guardado{tipoEvento === "medicion" ? "a" : ""} ({success.numeroGeneracion})
            {success.pdfUrl ? " — " : ""}
            {success.pdfUrl && (
              <a href={success.pdfUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                ver PDF
              </a>
            )}
          </SuccessNote>
          <div className="footer-nav">
            <span />
            <button type="button" className="btn btn-primary" onClick={empezarOtra}>
              + Cargar otra medición
            </button>
          </div>
        </>
      )}
      {!success && (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar y generar PDF"}
          </button>
        </div>
      )}
    </div>
  );
}
