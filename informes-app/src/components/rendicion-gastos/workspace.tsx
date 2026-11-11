"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { EstadoRendicion, Moneda } from "@/lib/database.types";
import { agregarGastoAction, cerrarRendicionAction, eliminarGastoAction, type GastoActionResult } from "@/app/(app)/rendicion-gastos/[id]/actions";
import { obtenerUrlPdfRendicionAction } from "@/app/(app)/rendicion-gastos/historial/actions";
import type { CatalogosRendicion, GastoTecnicoChip } from "./types";
import { TICKETS_FOTO_MAX } from "./types";
import { ErrorNote } from "@/components/notes";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { Icon } from "@/components/icon";
import { VerPdfLink } from "@/components/ver-pdf-link";
import { resizeImageToJpeg } from "@/lib/image-resize";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}
function fmtMonto(monto: number, moneda: string) {
  return `${moneda} ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface GastoWorkspaceItem {
  id: string;
  fecha: string;
  categoria: string;
  monto: number;
  descripcion: string | null;
  comprobanteUrl: string | null;
  tecnicos: { nombre: string; torre: string | null }[];
}

export function RendicionWorkspace({
  rendicionId,
  numeroGeneracion,
  motivo,
  fecha,
  proyectoCliente,
  provincia,
  viaticoRecibido,
  moneda,
  estado,
  pdfDisponible: pdfDisponibleInicial,
  esAdmin,
  gastos,
  catalogos,
}: {
  rendicionId: string;
  numeroGeneracion: string;
  motivo: string;
  fecha: string;
  proyectoCliente: string | null;
  provincia: string | null;
  viaticoRecibido: number;
  moneda: Moneda;
  estado: EstadoRendicion;
  pdfDisponible: boolean;
  esAdmin: boolean;
  gastos: GastoWorkspaceItem[];
  catalogos: CatalogosRendicion;
}) {
  const router = useRouter();
  const abierta = estado === "abierta";
  // Un Administrador puede reabrir una rendición ya cerrada (agregar/quitar
  // gastos y volver a "cerrarla", lo que en los hechos regenera el PDF) —
  // las Server Actions (ver actions.ts) ya aceptan esto con la service role
  // key cuando quien llama es admin. `abierta` sigue reflejando el estado
  // REAL (para el badge); `puedeEditar` es lo que controla qué se muestra.
  const puedeEditar = abierta || esAdmin;
  const reabriendoCerrada = !abierta && esAdmin;
  const totalGastado = gastos.reduce((sum, g) => sum + g.monto, 0);
  const saldo = viaticoRecibido - totalGastado;
  const aFavor = saldo >= 0;

  const [cerrando, setCerrando] = useState(false);
  const [cerrarError, setCerrarError] = useState<string | null>(null);
  const [pdfDisponible, setPdfDisponible] = useState<boolean>(pdfDisponibleInicial);
  const [busyGastoId, setBusyGastoId] = useState<string | null>(null);

  async function cerrar() {
    const confirmacion = reabriendoCerrada
      ? "¿Guardar los cambios y regenerar el PDF de esta rendición?"
      : "¿Cerrar esta rendición y generar el PDF? Después no vas a poder agregar más gastos.";
    if (!window.confirm(confirmacion)) return;
    setCerrando(true);
    setCerrarError(null);
    try {
      const res = await cerrarRendicionAction(rendicionId);
      if (!res.success) {
        const mensaje = res.error || "No se pudo cerrar la rendición.";
        setCerrarError(mensaje);
        reportarErrorCliente(mensaje, "cerrar-rendicion");
        return;
      }
      setPdfDisponible(!!res.pdfUrl);
      router.refresh();
    } catch (err) {
      // Antes esto no tenía try/catch: si fallaba acá el botón quedaba
      // trabado en "Cerrando..." para siempre, sin avisar nada.
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado cerrando la rendición.";
      setCerrarError(mensaje);
      reportarErrorCliente(mensaje, "cerrar-rendicion", err instanceof Error ? err.stack : undefined);
    } finally {
      setCerrando(false);
    }
  }

  async function quitarGasto(gastoId: string) {
    setBusyGastoId(gastoId);
    await eliminarGastoAction(rendicionId, gastoId);
    setBusyGastoId(null);
    router.refresh();
  }

  return (
    <div>
      <div className="page-heading">
        <h1>{motivo}</h1>
        <p>
          {numeroGeneracion} · {fmtFecha(fecha)}
          {proyectoCliente ? ` · ${proyectoCliente}` : ""} ·{" "}
          <span className={`hist-status ${abierta ? "warn" : "ok"}`}>{abierta ? "Abierta" : "Cerrada"}</span>
        </p>
      </div>

      <div className="card">
        <div className="saldo-box">
          <div className="label">{aFavor ? "Saldo a favor de la empresa" : "Saldo a favor del empleado (a reintegrar)"}</div>
          <div className={`amount ${aFavor ? "positive" : "negative"}`}>{fmtMonto(Math.abs(saldo), moneda)}</div>
        </div>
        <table className="review-table" style={{ marginTop: 14 }}>
          <tbody>
            <tr>
              <td className="k">Viático Recibido</td>
              <td className="v">{fmtMonto(viaticoRecibido, moneda)}</td>
            </tr>
            <tr>
              <td className="k">Total Gastado</td>
              <td className="v">{fmtMonto(totalGastado, moneda)}</td>
            </tr>
            <tr>
              <td className="k">Cantidad de Gastos</td>
              <td className="v">{gastos.length}</td>
            </tr>
            {provincia && (
              <tr>
                <td className="k">Provincia</td>
                <td className="v">{provincia}</td>
              </tr>
            )}
          </tbody>
        </table>

        {puedeEditar ? (
          <>
            {reabriendoCerrada && pdfDisponible && (
              <div style={{ marginBottom: 10 }}>
                <VerPdfLink
                  className="btn btn-secondary"
                  style={{ width: "100%", justifyContent: "center" }}
                  obtenerUrl={() => obtenerUrlPdfRendicionAction(rendicionId)}
                >
                  <Icon name="document" size={14} /> Ver PDF actual (antes de la edición)
                </VerPdfLink>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={cerrar} disabled={cerrando}>
                {cerrando ? (
                  reabriendoCerrada ? "Guardando..." : "Cerrando..."
                ) : reabriendoCerrada ? (
                  <>
                    <Icon name="lock" size={14} /> Guardar cambios y regenerar PDF
                  </>
                ) : (
                  <>
                    <Icon name="lock" size={14} /> Cerrar rendición y generar PDF
                  </>
                )}
              </button>
              <a
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: "center" }}
                href={`/api/rendiciones/${rendicionId}/excel`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="chart" size={14} /> Exportar Excel {reabriendoCerrada ? "" : "(parcial)"}
              </a>
            </div>
            {cerrarError && <ErrorNote>{cerrarError}</ErrorNote>}
          </>
        ) : (
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            {pdfDisponible && (
              <VerPdfLink
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: "center" }}
                obtenerUrl={() => obtenerUrlPdfRendicionAction(rendicionId)}
              >
                <Icon name="document" size={14} /> Ver PDF
              </VerPdfLink>
            )}
            <a
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: "center" }}
              href={`/api/rendiciones/${rendicionId}/excel`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="chart" size={14} /> Exportar Excel
            </a>
          </div>
        )}
      </div>

      {puedeEditar && <CargaMasivaTicketsForm rendicionId={rendicionId} catalogos={catalogos} onAdded={() => router.refresh()} />}
      {puedeEditar && <AgregarGastoForm rendicionId={rendicionId} catalogos={catalogos} onAdded={() => router.refresh()} />}

      <div className="card">
        <div className="review-block-title">Gastos cargados</div>
        {gastos.length === 0 ? (
          <div className="empty-note">Todavía no cargaste gastos.</div>
        ) : (
          <div className="item-list" style={{ marginTop: 0 }}>
            {gastos.map((g) => (
              <div className="list-item" key={g.id}>
                <div className="info">
                  {g.comprobanteUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura desde URL firmada de Storage
                    <img className="gasto-thumb" src={g.comprobanteUrl} alt="" />
                  ) : (
                    <div className="avatar">$</div>
                  )}
                  <div>
                    <div className="item-name">
                      {g.categoria} — {fmtMonto(g.monto, moneda)}
                    </div>
                    <div className="item-sub">
                      {fmtFecha(g.fecha)} {g.descripcion ? `· ${g.descripcion}` : ""}
                      {g.tecnicos.length ? ` · ${g.tecnicos.map((t) => t.nombre).join(", ")}` : ""}
                    </div>
                  </div>
                </div>
                {puedeEditar && (
                  <button type="button" className="remove-btn" disabled={busyGastoId === g.id} onClick={() => quitarGasto(g.id)}>
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgregarGastoForm({
  rendicionId,
  catalogos,
  onAdded,
}: {
  rendicionId: string;
  catalogos: CatalogosRendicion;
  onAdded: () => void;
}) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = useState("");
  const [categoriaNueva, setCategoriaNueva] = useState("");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState<string | null>(null);
  const [tecNombre, setTecNombre] = useState("");
  const [tecTorre, setTecTorre] = useState("");
  const [chips, setChips] = useState<GastoTecnicoChip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function setComprobanteFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setComprobante(file);
    setComprobantePreview(URL.createObjectURL(file));
  }
  // Al elegir/tipear un técnico que existe en el catálogo (profiles.torre),
  // completa el sector solo — la persona puede corregirlo después a mano
  // (ej. técnico sin torre asignada en el catálogo, o un cambio puntual).
  function handleTecNombreChange(value: string) {
    setTecNombre(value);
    const match = catalogos.tecnicos.find((t) => t.nombre.toLowerCase() === value.trim().toLowerCase());
    if (match?.torre) setTecTorre(match.torre);
  }
  function addChip() {
    if (!tecNombre.trim()) return;
    setChips([...chips, { nombre: tecNombre.trim(), torre: tecTorre.trim() }]);
    setTecNombre("");
    setTecTorre("");
  }
  function removeChip(i: number) {
    setChips(chips.filter((_, idx) => idx !== i));
  }

  async function agregar() {
    const categoriaFinal = categoria === "__new" ? categoriaNueva.trim() : categoria;
    const montoNum = Number(monto.replace(",", "."));
    if (!categoriaFinal || !Number.isFinite(montoNum) || montoNum <= 0) {
      setError("Completá categoría y un monto válido.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("fecha", fecha);
    fd.set("categoria", categoriaFinal);
    fd.set("monto", monto);
    fd.set("descripcion", descripcion);
    fd.set("tecnicos", JSON.stringify(chips));
    // Achica/recomprime en el navegador antes de subir — mismo criterio que
    // el resto de los módulos de fotos de la app (ver src/lib/image-resize.ts):
    // sin esto, la foto de cámara se subía tal cual (varios MB cada una),
    // inflando el storage y el PDF final (una rendición con 10-11 comprobantes
    // terminaba pesando 15MB).
    if (comprobante) {
      try {
        const jpeg = await resizeImageToJpeg(comprobante);
        fd.set("comprobante", jpeg, "comprobante.jpg");
      } catch (err) {
        setBusy(false);
        setError(err instanceof Error ? err.message : "No se pudo procesar el comprobante.");
        return;
      }
    }

    // Si agregarGastoAction tira (caída de red, función que se corta a mitad
    // de subir la foto, etc.) hay que atraparlo igual que una respuesta
    // {success:false} — sin este catch, setBusy(false) nunca se ejecuta y el
    // formulario queda trabado para siempre con el botón deshabilitado.
    let res: GastoActionResult;
    try {
      res = await agregarGastoAction(rendicionId, fd);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "No se pudo agregar el gasto — probá de nuevo.");
      return;
    }
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar el gasto.");
      return;
    }
    setCategoria("");
    setCategoriaNueva("");
    setMonto("");
    setDescripcion("");
    setComprobante(null);
    setComprobantePreview(null);
    setChips([]);
    onAdded();
  }

  return (
    <div className="card">
      <div className="section-label">Agregar Gasto</div>
      <div className="grid2">
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>Categoría</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy}>
            <option value="">Seleccionar categoría...</option>
            {catalogos.categoriasGasto.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__new">+ Agregar nueva categoría...</option>
          </select>
          {categoria === "__new" && (
            <input
              type="text"
              placeholder="Nombre de la nueva categoría"
              value={categoriaNueva}
              onChange={(e) => setCategoriaNueva(e.target.value)}
              disabled={busy}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>Monto</label>
          <input type="text" inputMode="decimal" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>
            Comprobante <span className="opt">(foto, opcional)</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              <Icon name="upload" size={13} /> Subir
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => cameraInputRef.current?.click()} disabled={busy}>
              <Icon name="camera" size={13} /> Cámara
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setComprobanteFile(e.target.files)} />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => setComprobanteFile(e.target.files)}
          />
          {comprobantePreview && (
            <div className="hint">
              Comprobante adjuntado <Icon name="check" size={12} />
            </div>
          )}
        </div>
      </div>
      <div className="field">
        <label>
          Descripción <span className="opt">(opcional)</span>
        </label>
        <input type="text" placeholder="Ej: Almuerzo equipo de trabajo" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={busy} />
      </div>

      <div className="field">
        <label>
          Técnicos de este gasto <span className="opt">(uno o varios)</span>
        </label>
        <div className="tech-form-grid" style={{ marginBottom: 10 }}>
          <AutocompleteInput
            value={tecNombre}
            onChange={handleTecNombreChange}
            onCommit={handleTecNombreChange}
            suggestions={catalogos.tecnicos.map((t) => t.nombre)}
            placeholder="Nombre completo"
            disabled={busy}
          />
          <AutocompleteInput value={tecTorre} onChange={setTecTorre} suggestions={catalogos.torres} placeholder="Torre" disabled={busy} />
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addChip} disabled={busy}>
          + Agregar técnico a este gasto
        </button>
        <div className="chip-row">
          {chips.map((c, i) => (
            <span className="chip" key={`${c.nombre}-${i}`}>
              {c.nombre}
              {c.torre ? ` — ${c.torre}` : ""}
              <button type="button" onClick={() => removeChip(i)} disabled={busy}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={agregar} disabled={busy}>
        {busy ? "Guardando..." : "+ Agregar Gasto"}
      </button>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

interface TicketDraft {
  file: File;
  previewUrl: string;
  fecha: string;
  categoria: string;
  categoriaNueva: string;
  monto: string;
  descripcion: string;
  status: "pendiente" | "guardando" | "error";
  error?: string;
}

/**
 * Carga masiva de tickets con IA: a diferencia de AgregarGastoForm (un gasto
 * por vez), acá se sacan/suben varias fotos juntas y la IA lee TODAS en una
 * sola llamada — cada foto es un ticket distinto (no páginas del mismo
 * documento, ver /api/rendicion-gastos/leer-tickets). El resultado queda
 * como borradores editables, nunca se guarda directo: el usuario revisa/
 * corrige fecha, categoría, monto y descripción de cada uno antes de
 * confirmar, igual criterio que el resto de la lectura con IA de la app.
 */
function CargaMasivaTicketsForm({
  rendicionId,
  catalogos,
  onAdded,
}: {
  rendicionId: string;
  catalogos: CatalogosRendicion;
  onAdded: () => void;
}) {
  const [fotos, setFotos] = useState<File[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [nota, setNota] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<TicketDraft[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function agregarFotos(files: File[]) {
    if (files.length === 0) return;
    setNota(null);
    setFotos((prev) => {
      const disponibles = TICKETS_FOTO_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  function quitarFoto(i: number) {
    setFotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function leerConIa() {
    if (fotos.length === 0) return;
    setLeyendo(true);
    setNota(null);
    try {
      const fd = new FormData();
      const jpegs: Blob[] = [];
      for (const f of fotos) {
        const jpeg = await resizeImageToJpeg(f);
        jpegs.push(jpeg);
        fd.append("fotos", jpeg, "ticket.jpg");
      }
      const res = await fetch("/api/rendicion-gastos/leer-tickets", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setNota(data.error || "No se pudieron leer los tickets.");
        return;
      }
      const detectados: { fecha: string | null; monto: number | null; categoria: string | null; descripcion: string | null }[] = data.gastos ?? [];
      const hoy = new Date().toISOString().slice(0, 10);
      const nuevosDrafts: TicketDraft[] = detectados.map((d, i) => {
        const categoriaDetectada = d.categoria ?? "";
        const yaExiste = catalogos.categoriasGasto.some((c) => c.toLowerCase() === categoriaDetectada.toLowerCase());
        return {
          file: fotos[i],
          previewUrl: URL.createObjectURL(jpegs[i]),
          fecha: d.fecha ?? hoy,
          categoria: categoriaDetectada && yaExiste ? categoriaDetectada : categoriaDetectada ? "__new" : "",
          categoriaNueva: categoriaDetectada && !yaExiste ? categoriaDetectada : "",
          monto: d.monto != null ? String(d.monto) : "",
          descripcion: d.descripcion ?? "",
          status: "pendiente",
        };
      });
      setDrafts((prev) => [...prev, ...nuevosDrafts]);
      setNota(`Se leyeron ${nuevosDrafts.length} ticket${nuevosDrafts.length === 1 ? "" : "s"} — revisá cada uno antes de confirmar.`);
      setFotos([]);
    } catch (err) {
      setNota("No se pudieron leer los tickets.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo tickets con IA", "leer-tickets-rendicion");
    } finally {
      setLeyendo(false);
    }
  }

  // Identifica cada borrador por su previewUrl (única por archivo), no por
  // índice posicional — confirmarTodos va sacando elementos de a uno
  // mientras recorre una copia de la lista original, así que un índice fijo
  // apuntaría a un borrador distinto en cuanto se borre alguno anterior.
  function actualizarDraft(key: string, patch: Partial<TicketDraft>) {
    setDrafts((prev) => prev.map((d) => (d.previewUrl === key ? { ...d, ...patch } : d)));
  }

  function quitarDraft(key: string) {
    setDrafts((prev) => {
      const draft = prev.find((d) => d.previewUrl === key);
      if (draft) URL.revokeObjectURL(draft.previewUrl);
      return prev.filter((d) => d.previewUrl !== key);
    });
  }

  async function confirmarTodos() {
    setConfirmando(true);
    let huboExito = false;
    try {
      for (const d of drafts) {
        const key = d.previewUrl;
        if (d.status === "guardando") continue;
        const categoriaFinal = d.categoria === "__new" ? d.categoriaNueva.trim() : d.categoria;
        const montoNum = Number(d.monto.replace(",", "."));
        if (!d.fecha || !categoriaFinal || !Number.isFinite(montoNum) || montoNum <= 0) {
          actualizarDraft(key, { status: "error", error: "Completá fecha, categoría y un monto válido." });
          continue;
        }
        actualizarDraft(key, { status: "guardando", error: undefined });
        const fd = new FormData();
        fd.set("fecha", d.fecha);
        fd.set("categoria", categoriaFinal);
        fd.set("monto", d.monto);
        fd.set("descripcion", d.descripcion);
        fd.set("tecnicos", "[]");
        try {
          const jpeg = await resizeImageToJpeg(d.file);
          fd.set("comprobante", jpeg, "comprobante.jpg");
        } catch {
          // si falla el resize del comprobante, el gasto se guarda igual sin foto adjunta
        }
        // Si agregarGastoAction tira (caída de red, función que se corta a
        // mitad de subir la foto, etc.) hay que atraparlo por cada ticket y
        // seguir con el resto — sin este catch, el primero que falla corta
        // todo el for en silencio: ni termina de confirmar los que siguen
        // ni suelta el botón (setConfirmando(false) quedaba sin ejecutar).
        try {
          const res = await agregarGastoAction(rendicionId, fd);
          if (res.success) {
            huboExito = true;
            quitarDraft(key);
          } else {
            actualizarDraft(key, { status: "error", error: res.error || "No se pudo guardar." });
          }
        } catch (err) {
          actualizarDraft(key, { status: "error", error: err instanceof Error ? err.message : "No se pudo guardar — probá de nuevo." });
        }
      }
    } finally {
      setConfirmando(false);
    }
    if (huboExito) onAdded();
  }

  return (
    <div className="card">
      <div className="section-label">Carga masiva de tickets con IA</div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        <Icon name="ai" size={13} /> Sacá o subí hasta {TICKETS_FOTO_MAX} fotos de tickets de una vez — cada foto es un gasto distinto
        (no páginas del mismo ticket). La IA lee todas juntas y te deja un borrador de cada gasto para que revises/corrijas antes de
        confirmar.
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          agregarFotos(files);
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          agregarFotos(files);
        }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: fotos.length ? 8 : 12 }}>
        <button
          type="button"
          className="ai-btn"
          onClick={() => cameraInputRef.current?.click()}
          disabled={leyendo || fotos.length >= TICKETS_FOTO_MAX}
        >
          <Icon name="camera" size={13} /> Sacar fotos ({fotos.length}/{TICKETS_FOTO_MAX})
        </button>
        <button
          type="button"
          className="ai-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={leyendo || fotos.length >= TICKETS_FOTO_MAX}
        >
          <Icon name="upload" size={13} /> Subir fotos
        </button>
        {fotos.length > 0 && (
          <button type="button" className="ai-btn" onClick={() => void leerConIa()} disabled={leyendo}>
            <Icon name="ai" size={13} /> {leyendo ? "Leyendo..." : `Leer ${fotos.length} foto${fotos.length === 1 ? "" : "s"} con IA`}
          </button>
        )}
      </div>
      {fotos.length > 0 && (
        <div className="chip-row" style={{ marginTop: 0, marginBottom: 12 }}>
          {fotos.map((f, i) => (
            <span className="chip" key={i}>
              Foto {i + 1}
              <button type="button" onClick={() => quitarFoto(i)} disabled={leyendo} aria-label={`Quitar foto ${i + 1}`}>
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {nota && <div className="hint">{nota}</div>}

      {drafts.length > 0 && (
        <div className="item-list" style={{ marginTop: 12 }}>
          {drafts.map((d) => (
            <div className="list-item" key={d.previewUrl} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura del archivo recién leído, todavía no subido a Storage */}
                <img src={d.previewUrl} alt="" className="gasto-thumb" />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="grid2">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Fecha</label>
                      <input
                        type="date"
                        value={d.fecha}
                        onChange={(e) => actualizarDraft(d.previewUrl, { fecha: e.target.value })}
                        disabled={d.status === "guardando"}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Categoría</label>
                      <select
                        value={d.categoria}
                        onChange={(e) => actualizarDraft(d.previewUrl, { categoria: e.target.value })}
                        disabled={d.status === "guardando"}
                      >
                        <option value="">Seleccionar...</option>
                        {catalogos.categoriasGasto.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__new">+ Nueva categoría...</option>
                      </select>
                      {d.categoria === "__new" && (
                        <input
                          type="text"
                          placeholder="Nombre de la categoría"
                          value={d.categoriaNueva}
                          onChange={(e) => actualizarDraft(d.previewUrl, { categoriaNueva: e.target.value })}
                          disabled={d.status === "guardando"}
                          style={{ marginTop: 6 }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="grid2">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Monto</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={d.monto}
                        onChange={(e) => actualizarDraft(d.previewUrl, { monto: e.target.value })}
                        disabled={d.status === "guardando"}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Descripción</label>
                      <input
                        type="text"
                        placeholder="Ej: YPF Ruta 9"
                        value={d.descripcion}
                        onChange={(e) => actualizarDraft(d.previewUrl, { descripcion: e.target.value })}
                        disabled={d.status === "guardando"}
                      />
                    </div>
                  </div>
                  {d.error && <div className="error-text">{d.error}</div>}
                </div>
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => quitarDraft(d.previewUrl)}
                  disabled={d.status === "guardando"}
                  aria-label="Descartar este borrador"
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-primary" onClick={() => void confirmarTodos()} disabled={confirmando}>
            {confirmando ? "Guardando..." : `Confirmar y agregar ${drafts.length} gasto${drafts.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
