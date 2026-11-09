"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  activarGuardiaTecnicaAction,
  aceptarActivacionAction,
  noContestaAction,
  agregarNovedadAction,
  terminarParticipacionAction,
  cerrarEventoAction,
} from "@/app/(app)/guardia/actions";
import type { AreaGuardia } from "@/lib/guardia/cronograma";
import type {
  EstadoEventoGuardia,
  EstadoParticipacionGuardia,
  ModalidadParticipacionGuardia,
  PedidoParticipacionGuardia,
  TipoAlarmaGuardia,
  TicketTipoGuardia,
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
  creadoAt: string;
  cerradoAt: string | null;
}

export interface ParticipacionFila {
  id: string;
  usuarioId: string;
  nombre: string;
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
  miUsuarioId,
  soyGuardiaGeneralDeEste,
  candidatos,
}: {
  p: ParticipacionFila;
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

function ActivarGuardiaTecnica({ eventoId, personasPorArea }: { eventoId: string; personasPorArea: Record<AreaGuardia, { id: string; nombre: string }[]> }) {
  const router = useRouter();
  const [areas, setAreas] = useState<Set<AreaGuardia>>(new Set());
  const [pedido, setPedido] = useState<PedidoParticipacionGuardia>("REVISAR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinAsignar, setSinAsignar] = useState<AreaGuardia[] | null>(null);

  function toggle(area: AreaGuardia) {
    setAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  async function activar() {
    if (areas.size === 0) return;
    setBusy(true);
    setError(null);
    setSinAsignar(null);
    const res = await activarGuardiaTecnicaAction(eventoId, [...areas], pedido);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo activar.");
      return;
    }
    if (res.sinAsignar) setSinAsignar(res.sinAsignar);
    setAreas(new Set());
    router.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-label">Activar guardia técnica</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        {AREAS_TECNICAS.map((area) => (
          <label key={area} className="checkbox-row" style={{ marginBottom: 0 }}>
            <input type="checkbox" checked={areas.has(area)} onChange={() => toggle(area)} disabled={busy} />
            {area} {personasPorArea[area].length === 0 && "(sin gente cargada)"}
          </label>
        ))}
      </div>
      <div className="tech-form-grid" style={{ marginTop: 10 }}>
        <select value={pedido} onChange={(e) => setPedido(e.target.value as PedidoParticipacionGuardia)} disabled={busy}>
          <option value="REVISAR">Revisar</option>
          <option value="ASISTIR">Asistir al sitio</option>
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={activar} disabled={busy || areas.size === 0}>
          {busy ? "Activando..." : "Activar y avisar"}
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}
      {sinAsignar && sinAsignar.length > 0 && (
        <div className="error-text">No había nadie de guardia ahora mismo en: {sinAsignar.join(", ")}.</div>
      )}
    </div>
  );
}

function Novedades({ eventoId, novedades }: { eventoId: string; novedades: NovedadFila[] }) {
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

  return (
    <div className="card">
      <div className="section-label">Novedades</div>
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
}: {
  evento: EventoDetalle;
  participaciones: ParticipacionFila[];
  novedades: NovedadFila[];
  miUsuarioId: string;
  soyGuardiaGeneralDeEste: boolean;
  personasPorArea: Record<AreaGuardia, { id: string; nombre: string }[]>;
}) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abierto = evento.estado === "abierto";

  async function cerrar() {
    if (!window.confirm("¿Cerrar el evento? A quien no haya terminado se le pone fin ahora.")) return;
    setCerrando(true);
    setError(null);
    const res = await cerrarEventoAction(evento.id);
    setCerrando(false);
    if (!res.success) setError(res.error || "No se pudo cerrar.");
    else router.refresh();
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="badge">{abierto ? "Abierto" : "Cerrado"}</span>
          {soyGuardiaGeneralDeEste && abierto && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar} disabled={cerrando}>
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
        {error && <div className="error-text">{error}</div>}
      </div>

      {soyGuardiaGeneralDeEste && abierto && <ActivarGuardiaTecnica eventoId={evento.id} personasPorArea={personasPorArea} />}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-label">Participantes</div>
        <div className="item-list" style={{ marginTop: 8 }}>
          {participaciones.map((p) => (
            <FilaParticipacion key={p.id} p={p} miUsuarioId={miUsuarioId} soyGuardiaGeneralDeEste={soyGuardiaGeneralDeEste} candidatos={personasPorArea[p.area]} />
          ))}
        </div>
      </div>

      <Novedades eventoId={evento.id} novedades={novedades} />
    </>
  );
}
