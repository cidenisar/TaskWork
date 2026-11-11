"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  activarGuardiaTecnicaAction,
  aceptarActivacionAction,
  noContestaAction,
  agregarNovedadAction,
  terminarParticipacionAction,
  revisarScadaAction,
  cerrarEventoAction,
} from "@/app/(app)/guardia/actions";
import type { AreaGuardia } from "@/lib/guardia/cronograma";
import { linkWhatsappGrupo, linkWhatsappIndividual } from "@/lib/guardia/whatsapp";
import type {
  EstadoEventoGuardia,
  EstadoParticipacionGuardia,
  ModalidadParticipacionGuardia,
  PedidoParticipacionGuardia,
  TipoAlarmaGuardia,
  TicketTipoGuardia,
  ScadaGuardia,
} from "@/lib/database.types";
import { Icon } from "@/components/icon";

export interface EventoDetalle {
  id: string;
  numero: number;
  estado: EstadoEventoGuardia;
  tipoAlarma: TipoAlarmaGuardia;
  sitio: string;
  descripcion: string;
  ticketTipo: TicketTipoGuardia;
  ticketNumero: string | null;
  scada: ScadaGuardia | null;
  creadoAt: string;
  cerradoAt: string | null;
}

export interface ParticipacionFila {
  id: string;
  usuarioId: string;
  nombre: string;
  telefono: string | null;
  area: AreaGuardia;
  modalidad: ModalidadParticipacionGuardia | null;
  pedido: PedidoParticipacionGuardia | null;
  inicioAt: string;
  aceptoAt: string | null;
  finAt: string | null;
  estado: EstadoParticipacionGuardia;
}

export interface NovedadFila {
  id: string;
  at: string;
  texto: string;
  por: string | null;
}

const ESTADO_PARTICIPACION_LABEL: Record<EstadoParticipacionGuardia, string> = { en_curso: "En curso", terminada: "Terminada", no_contesto: "No contestó" };
const AREAS_TECNICAS: AreaGuardia[] = ["Infraestructura", "Datos", "Enlaces"];

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

function FilaParticipacion({
  p,
  evento,
  miUsuarioId,
  soyGuardiaGeneralDeEste,
  candidatos,
}: {
  p: ParticipacionFila;
  evento: EventoDetalle;
  miUsuarioId: string;
  soyGuardiaGeneralDeEste: boolean;
  candidatos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elegirOtro, setElegirOtro] = useState(false);
  const [otroId, setOtroId] = useState("");

  const esMia = p.usuarioId === miUsuarioId;
  const enCurso = p.estado === "en_curso";

  async function aceptar(modalidad: ModalidadParticipacionGuardia) {
    setBusy(true);
    setError(null);
    const res = await aceptarActivacionAction(p.id, modalidad);
    setBusy(false);
    if (!res.success) setError(res.error || "No se pudo guardar.");
    else router.refresh();
  }

  async function terminar() {
    setBusy(true);
    setError(null);
    const res = await terminarParticipacionAction(p.id);
    setBusy(false);
    if (!res.success) setError(res.error || "No se pudo guardar.");
    else router.refresh();
  }

  async function confirmarNoContesta() {
    if (!otroId) return;
    setBusy(true);
    setError(null);
    const res = await noContestaAction(p.id, otroId);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    setElegirOtro(false);
    router.refresh();
  }

  return (
    <div className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: 8 }}>
        <div className="info">
          <div>
            <div className="item-name">
              {p.nombre} <span className="badge">{p.area}</span>
            </div>
            <div className="item-sub">
              {p.pedido === "ASISTIR" ? "Asistir al sitio" : p.pedido === "REVISAR" ? "Revisar" : "Guardia general"} ·{" "}
              {ESTADO_PARTICIPACION_LABEL[p.estado]}
              {p.modalidad && ` · ${p.modalidad === "REMOTO" ? "Remoto" : "En el sitio"}`}
            </div>
            <div className="item-sub">
              Activado {fmt(p.inicioAt)}
              {p.aceptoAt && ` · Aceptó ${fmt(p.aceptoAt)}`}
              {p.finAt && ` · Terminó ${fmt(p.finAt)}`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {esMia && enCurso && !p.aceptoAt && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => aceptar("REMOTO")} disabled={busy}>
                Voy remoto
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => aceptar("CAMPO")} disabled={busy}>
                Voy al sitio
              </button>
            </>
          )}
          {esMia && enCurso && (
            <button type="button" className="btn btn-primary btn-sm" onClick={terminar} disabled={busy}>
              Terminé
            </button>
          )}
          {!esMia && soyGuardiaGeneralDeEste && enCurso && !p.aceptoAt && p.telefono && (
            <a
              href={linkWhatsappIndividual(
                p.telefono,
                `Te activaron en la guardia de ${p.area}: ${evento.tipoAlarma} – ${evento.descripcion} (${evento.sitio}). Te piden: ${p.pedido === "ASISTIR" ? "asistir al sitio" : "revisar"}. Abrí la app para aceptar.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              title="Avisar por WhatsApp"
              aria-label="Avisar por WhatsApp"
            >
              <Icon name="chat" size={13} />
            </a>
          )}
          {!esMia && soyGuardiaGeneralDeEste && enCurso && !p.aceptoAt && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setElegirOtro((v) => !v)} disabled={busy}>
              No contesta
            </button>
          )}
        </div>
      </div>
      {elegirOtro && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={otroId} onChange={(e) => setOtroId(e.target.value)} disabled={busy}>
            <option value="">Elegir a quién llamar...</option>
            {candidatos
              .filter((c) => c.id !== p.usuarioId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={confirmarNoContesta} disabled={busy || !otroId}>
            Activar
          </button>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

/**
 * Revisión del evento (HANDOFF §5, pasos 4-5 — unificados en una sola
 * decisión, pedido de Ivan después de la primera prueba real): la guardia
 * general revisa (SCADA u otro medio) y tiene que decidir UNA cosa — o ya
 * está normalizado (lleva directo a escribir el cierre, nunca se cierra
 * solo), o hace falta activar guardia técnica (eligiendo área y pedido).
 * Lo que se escribe como "qué encontraste" siempre queda como novedad
 * (`revisarScadaAction`), haya o no activación después.
 */
function RevisionEvento({
  eventoId,
  scadaActual,
  personasPorArea,
  onNormalizado,
}: {
  eventoId: string;
  scadaActual: ScadaGuardia | null;
  personasPorArea: Record<AreaGuardia, { id: string; nombre: string }[]>;
  onNormalizado: () => void;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<"normalizado" | "activar" | null>(null);
  const [detalle, setDetalle] = useState("");
  const [areas, setAreas] = useState<Set<AreaGuardia>>(new Set());
  const [pedido, setPedido] = useState<PedidoParticipacionGuardia>("REVISAR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinAsignar, setSinAsignar] = useState<AreaGuardia[] | null>(null);

  function toggleArea(area: AreaGuardia) {
    setAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  async function confirmarNormalizado() {
    setBusy(true);
    setError(null);
    const res = await revisarScadaAction(eventoId, "SIN_NOVEDAD", detalle);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    const detalleTexto = detalle.trim();
    window.open(linkWhatsappGrupo(`Revisado en el SCADA: sin novedad.${detalleTexto ? ` ${detalleTexto}` : ""}`), "_blank");
    setDetalle("");
    setDecision(null);
    router.refresh();
    onNormalizado();
  }

  async function confirmarActivar() {
    if (!detalle.trim()) {
      setError("Contá qué encontraste.");
      return;
    }
    if (areas.size === 0) {
      setError("Elegí al menos un área para activar.");
      return;
    }
    setBusy(true);
    setError(null);
    setSinAsignar(null);
    const resScada = await revisarScadaAction(eventoId, "CON_NOVEDAD", detalle);
    if (!resScada.success) {
      setBusy(false);
      setError(resScada.error || "No se pudo guardar.");
      return;
    }
    const resActivar = await activarGuardiaTecnicaAction(eventoId, [...areas], pedido);
    setBusy(false);
    if (!resActivar.success) {
      setError(resActivar.error || "No se pudo activar.");
      return;
    }
    const queHacer = pedido === "ASISTIR" ? "asistir al sitio" : "revisar";
    window.open(
      linkWhatsappGrupo(`Revisado en el SCADA: hay novedad. ${detalle.trim()}\nSe activa guardia de ${[...areas].join(", ")} para ${queHacer}.`),
      "_blank",
    );
    if (resActivar.sinAsignar) setSinAsignar(resActivar.sinAsignar);
    setAreas(new Set());
    setDetalle("");
    setDecision(null);
    router.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-label">Revisión</div>
      {scadaActual && (
        <p className="item-sub" style={{ marginTop: 6 }}>
          Última revisión: {scadaActual === "SIN_NOVEDAD" ? "sin novedad" : "con novedad"}.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn btn-sm ${decision === "normalizado" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setDecision("normalizado")}
          disabled={busy}
        >
          Normalizado
        </button>
        <button
          type="button"
          className={`btn btn-sm ${decision === "activar" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setDecision("activar")}
          disabled={busy}
        >
          Hace falta activar guardia
        </button>
      </div>

      {decision === "normalizado" && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            disabled={busy}
            placeholder="¿Qué viste al revisar? (opcional)"
            rows={2}
            style={{ width: "100%" }}
          />
          <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={confirmarNormalizado} disabled={busy}>
            {busy ? "Guardando..." : "Confirmar normalizado"}
          </button>
        </div>
      )}

      {decision === "activar" && (
        <div style={{ marginTop: 10 }}>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            disabled={busy}
            placeholder="¿Qué encontraste?"
            rows={2}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            {AREAS_TECNICAS.map((area) => (
              <label key={area} className="checkbox-row" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={areas.has(area)} onChange={() => toggleArea(area)} disabled={busy} />
                {area} {personasPorArea[area].length === 0 && "(sin gente cargada)"}
              </label>
            ))}
          </div>
          <div className="tech-form-grid" style={{ marginTop: 10 }}>
            <select value={pedido} onChange={(e) => setPedido(e.target.value as PedidoParticipacionGuardia)} disabled={busy}>
              <option value="REVISAR">Revisar</option>
              <option value="ASISTIR">Asistir al sitio</option>
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={confirmarActivar} disabled={busy || areas.size === 0}>
              {busy ? "Activando..." : "Activar y avisar"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-text">{error}</div>}
      {sinAsignar && sinAsignar.length > 0 && (
        <div className="error-text">No había nadie de guardia ahora mismo en: {sinAsignar.join(", ")}.</div>
      )}
    </div>
  );
}

function Novedades({ eventoId, evento, novedades, grupoWhatsapp }: { eventoId: string; evento: EventoDetalle; novedades: NovedadFila[]; grupoWhatsapp: string }) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    if (!texto.trim()) return;
    setBusy(true);
    setError(null);
    const res = await agregarNovedadAction(eventoId, texto, crypto.randomUUID());
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar.");
      return;
    }
    setTexto("");
    router.refresh();
  }

  const textoResumen = [
    `#${evento.numero.toString().padStart(4, "0")} · ${evento.tipoAlarma} — ${evento.sitio}`,
    evento.descripcion,
    "",
    ...novedades.map((n) => `${fmt(n.at)} — ${n.texto}`),
  ].join("\n");

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="section-label">Novedades</div>
        <a href={linkWhatsappGrupo(textoResumen)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
          <Icon name="chat" size={13} /> Compartir resumen completo
        </a>
      </div>
      <p className="item-sub" style={{ marginTop: 4 }}>
        Se abre WhatsApp — elegí &quot;{grupoWhatsapp}&quot; y enviá.
      </p>
      <div className="item-list" style={{ marginTop: 8 }}>
        {novedades.map((n) => (
          <div className="list-item" key={n.id}>
            <div className="info">
              <div>
                <div className="item-name">{n.texto}</div>
                <div className="item-sub">
                  {fmt(n.at)} {n.por ? `· ${n.por}` : "· Sistema"}
                </div>
              </div>
            </div>
            <a
              href={linkWhatsappGrupo(n.texto)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              title="Compartir por WhatsApp"
              aria-label="Compartir por WhatsApp"
            >
              <Icon name="chat" size={13} />
            </a>
          </div>
        ))}
        {novedades.length === 0 && <p className="empty-note">Todavía no hay novedades.</p>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input type="text" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={busy} placeholder="Agregar novedad..." style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary btn-sm" onClick={agregar} disabled={busy || !texto.trim()}>
          Agregar
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

export function EventoGuardiaDetalle({
  evento,
  participaciones,
  novedades,
  miUsuarioId,
  soyGuardiaGeneralDeEste,
  personasPorArea,
  grupoWhatsapp,
}: {
  evento: EventoDetalle;
  participaciones: ParticipacionFila[];
  novedades: NovedadFila[];
  miUsuarioId: string;
  soyGuardiaGeneralDeEste: boolean;
  personasPorArea: Record<AreaGuardia, { id: string; nombre: string }[]>;
  grupoWhatsapp: string;
}) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);
  const [textoCierre, setTextoCierre] = useState("");
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abierto = evento.estado === "abierto";

  async function cerrar() {
    if (!textoCierre.trim()) {
      setError("Contá cómo quedó para poder cerrar.");
      return;
    }
    setCerrando(true);
    setError(null);
    const res = await cerrarEventoAction(evento.id, textoCierre);
    setCerrando(false);
    if (!res.success) {
      setError(res.error || "No se pudo cerrar.");
      return;
    }
    window.open(linkWhatsappGrupo(textoCierre.trim()), "_blank");
    router.push("/guardia");
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="badge">{abierto ? "Abierto" : "Cerrado"}</span>
          {soyGuardiaGeneralDeEste && abierto && !mostrarCierre && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMostrarCierre(true)}>
              <Icon name="x" size={13} /> Cerrar evento
            </button>
          )}
        </div>
        <p style={{ marginTop: 10 }}>{evento.descripcion}</p>
        <div className="item-sub">
          {evento.ticketTipo}
          {evento.ticketNumero ? ` #${evento.ticketNumero}` : ""} · Llamada {fmt(evento.creadoAt)}
          {evento.cerradoAt && ` · Cerrado ${fmt(evento.cerradoAt)}`}
        </div>
        {mostrarCierre && (
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            <input
              type="text"
              value={textoCierre}
              onChange={(e) => setTextoCierre(e.target.value)}
              disabled={cerrando}
              placeholder="¿Cómo quedó? (ej. quedó sin novedad, normalizado...)"
              style={{ flex: 1, minWidth: 220 }}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={cerrar} disabled={cerrando || !textoCierre.trim()}>
              {cerrando ? "Cerrando..." : "Confirmar cierre"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMostrarCierre(false)} disabled={cerrando}>
              Cancelar
            </button>
          </div>
        )}
        {error && <div className="error-text">{error}</div>}
      </div>

      {soyGuardiaGeneralDeEste && abierto && (
        <RevisionEvento
          eventoId={evento.id}
          scadaActual={evento.scada}
          personasPorArea={personasPorArea}
          onNormalizado={() => setMostrarCierre(true)}
        />
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Participantes</div>
        <div className="item-list" style={{ marginTop: 8 }}>
          {participaciones.map((p) => (
            <FilaParticipacion
              key={p.id}
              p={p}
              evento={evento}
              miUsuarioId={miUsuarioId}
              soyGuardiaGeneralDeEste={soyGuardiaGeneralDeEste}
              candidatos={personasPorArea[p.area]}
            />
          ))}
        </div>
      </div>

      <Novedades eventoId={evento.id} evento={evento} novedades={novedades} grupoWhatsapp={grupoWhatsapp} />
    </>
  );
}
