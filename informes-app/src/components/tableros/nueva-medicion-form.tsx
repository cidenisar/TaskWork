"use client";

import { useMemo, useRef, useState } from "react";
import { crearMedicionTableroAction } from "@/app/(app)/tableros/nuevo/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import type { TableroEventoTipo, TableroTipo } from "@/lib/database.types";
import {
  TABLERO_TIPOS,
  TABLERO_TIPO_LABEL,
  TABLERO_EVENTO_LABEL,
  ESTADO_OPCIONES,
  esTipoEnergia,
  pideCorrientePorFase,
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

export function NuevaMedicionForm({ tableros }: { tableros: TableroConCircuitos[] }) {
  const [tipo, setTipo] = useState<TableroTipo>("energia");
  const [tipoEventoElegido, setTipoEventoElegido] = useState<TableroEventoTipo>("medicion");
  const [tableroId, setTableroId] = useState<string>(""); // "" = sin elegir, "__new" = crear
  const [denominacionNueva, setDenominacionNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [circuitos, setCircuitos] = useState<CircuitoItem[]>([]);
  const [lecturas, setLecturas] = useState<Record<number, LecturaState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ numeroGeneracion: string; pdfUrl: string | null } | null>(null);
  const [iaBusy, setIaBusy] = useState(false);
  const [iaNote, setIaNote] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const energia = esTipoEnergia(tipo);
  // Solo un tablero de energía distingue medición de relevamiento — para
  // CCTV/Control de Acceso siempre es relevamiento (nunca miden corriente).
  const tipoEvento: TableroEventoTipo = energia ? tipoEventoElegido : "relevamiento";
  const mideCorriente = pideCorrientePorFase(tipo, tipoEvento);
  const tablerosDelTipo = useMemo(() => tableros.filter((t) => t.tipo === tipo), [tableros, tipo]);
  const estadoOpciones = ESTADO_OPCIONES[tipo];

  function cambiarTipo(nuevoTipo: TableroTipo) {
    setTipo(nuevoTipo);
    setTableroId("");
    setCircuitos([]);
    setLecturas({});
  }

  function elegirTablero(id: string) {
    setTableroId(id);
    setSuccess(null);
    if (id === "__new" || id === "") {
      setCircuitos([]);
      setLecturas({});
      return;
    }
    const t = tablerosDelTipo.find((x) => x.id === id);
    setCircuitos(t ? [...t.circuitos] : []);
    setLecturas({});
  }

  async function leerFotoConIa(file: File | undefined) {
    if (!file) return;
    setIaBusy(true);
    setIaNote(null);
    try {
      const jpeg = await resizeImageToJpeg(file);
      const fd = new FormData();
      fd.append("foto", jpeg, "tablero.jpg");
      fd.append("tipo", tipo);
      const res = await fetch("/api/tableros/leer-foto", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setIaNote(data.error || "No se pudo leer la foto.");
        return;
      }
      const detectados: { numero: number; texto: string; ampNominal: string }[] = data.circuitos ?? [];
      if (detectados.length === 0) {
        setIaNote("No se detectó ningún circuito/elemento en la foto — probá con otra o cargalos a mano.");
        return;
      }
      const siguienteBase = circuitos.length ? Math.max(...circuitos.map((c) => c.numero)) : 0;
      setCircuitos((prev) => [
        ...prev,
        ...detectados.map((d, i) => ({ id: null, numero: siguienteBase + i + 1, texto: d.texto, ampNominal: d.ampNominal })),
      ]);
      setIaNote(`Se agregaron ${detectados.length} ${energia ? "circuitos" : "elementos"} desde la foto — revisalos antes de guardar.`);
    } catch (err) {
      setIaNote("No se pudo leer la foto.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo foto de tablero con IA", "leer-foto-tablero");
    } finally {
      setIaBusy(false);
    }
  }

  function agregarCircuito() {
    const siguienteNumero = circuitos.length ? Math.max(...circuitos.map((c) => c.numero)) + 1 : 1;
    setCircuitos((prev) => [...prev, { id: null, numero: siguienteNumero, texto: "", ampNominal: "" }]);
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
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }
    if (circuitos.length === 0) {
      setError(`Agregá al menos un ${energia ? "circuito" : "elemento"}.`);
      return;
    }
    const circuitosSinTexto = circuitos.some((c) => !c.texto.trim());
    if (circuitosSinTexto) {
      setError(`Completá el texto de todos los ${energia ? "circuitos" : "elementos"} cargados.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await crearMedicionTableroAction({
        tipo,
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
    setDenominacionNueva("");
    setSitioNueva("");
    setCircuitos([]);
    setLecturas({});
  }

  return (
    <div>
      <div className="page-heading">
        <h1>{tipoEvento === "medicion" ? "Nueva Medición" : "Nuevo Relevamiento"}</h1>
        <p>Elegí el tablero, cargá la fecha y las lecturas por {energia ? "circuito" : "elemento"} — se genera el PDF al guardar.</p>
      </div>

      <div className="card">
        <div className="section-label">Tipo de Tablero</div>
        <div className="tech-form-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {TABLERO_TIPOS.map((t) => (
            <button
              key={t}
              type="button"
              className={`btn ${tipo === t ? "btn-primary" : "btn-secondary"}`}
              onClick={() => cambiarTipo(t)}
              disabled={submitting}
            >
              {TABLERO_TIPO_LABEL[t]}
            </button>
          ))}
        </div>
        {energia && (
          <>
            <div className="section-label" style={{ marginTop: 16 }}>
              Tipo de Visita
            </div>
            <div className="hint" style={{ margin: "-4px 0 12px" }}>
              Medición mide corriente por fase; Relevamiento es un chequeo de estado más liviano, sin medir corriente.
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
      </div>

      <div className="card">
        <div className="section-label">Tablero</div>
        <div className="field">
          <label>
            Elegí uno existente o creá uno nuevo <span className="req">*</span>
          </label>
          <select value={tableroId} onChange={(e) => elegirTablero(e.target.value)} disabled={submitting}>
            <option value="">Seleccionar tablero...</option>
            {tablerosDelTipo.map((t) => (
              <option key={t.id} value={t.id}>
                {t.denominacion} — {t.sitio}
              </option>
            ))}
            <option value="__new">+ Crear tablero nuevo...</option>
          </select>
        </div>
        {tableroId === "__new" && (
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
        )}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>
            Fecha <span className="req">*</span>
          </label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} style={{ maxWidth: 220 }} />
        </div>
      </div>

      {tableroId && (
        <div className="card">
          <div className="section-label">{energia ? "Circuitos" : "Elementos"}</div>
          <div className="hint" style={{ margin: "-4px 0 12px" }}>
            <Icon name="ai" size={13} /> Sacale una foto al tablero y la IA te arma la lista de {energia ? "circuitos" : "elementos"}{" "}
            automáticamente — revisala y corregí lo que haga falta antes de guardar.
          </div>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              void leerFotoConIa(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="ai-btn"
            onClick={() => fotoInputRef.current?.click()}
            disabled={submitting || iaBusy}
            style={{ marginBottom: 12 }}
          >
            <Icon name="camera" size={13} /> {iaBusy ? "Leyendo foto..." : "Leer foto con IA"}
          </button>
          {iaNote && (
            <div className="ai-note" style={{ marginBottom: 12 }}>
              <span>{iaNote}</span>
            </div>
          )}
          {circuitos.length === 0 && <div className="empty-note">Todavía no hay {energia ? "circuitos" : "elementos"} cargados.</div>}
          <div className="item-list" style={{ marginTop: circuitos.length ? 0 : 12 }}>
            {circuitos.map((c, i) => {
              const l = lecturas[i] ?? LECTURA_VACIA;
              const esNuevo = c.id === null;
              return (
                <div className="list-item" key={i} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  {esNuevo ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div className="field" style={{ marginBottom: 0, width: 70 }}>
                        <label style={{ fontSize: 11 }}>N°</label>
                        <input
                          type="number"
                          value={c.numero}
                          onChange={(e) => actualizarCircuito(i, { numero: Number(e.target.value) || 0 })}
                          disabled={submitting}
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                        <label style={{ fontSize: 11 }}>{energia ? "Circuito" : "Elemento"}</label>
                        <input
                          type="text"
                          placeholder={energia ? "Ej: RACK 1" : "Ej: Cámara Hall"}
                          value={c.texto}
                          onChange={(e) => actualizarCircuito(i, { texto: e.target.value })}
                          disabled={submitting}
                        />
                      </div>
                      {energia && (
                        <div className="field" style={{ marginBottom: 0, width: 100 }}>
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
                  ) : (
                    <div className="item-name">
                      {c.numero} — {c.texto}
                      {energia && c.ampNominal ? ` (${c.ampNominal})` : ""}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div className="field" style={{ marginBottom: 0, width: 140 }}>
                      <label style={{ fontSize: 11 }}>Estado</label>
                      <select value={l.estado} onChange={(e) => actualizarLectura(i, { estado: e.target.value })} disabled={submitting}>
                        <option value="">—</option>
                        {estadoOpciones.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    {mideCorriente && (
                      <>
                        {(["F", "R", "S", "T"] as const).map((fase) => {
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
            <Icon name="plus" size={13} /> Agregar {energia ? "circuito" : "elemento"}
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
