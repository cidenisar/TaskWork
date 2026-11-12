"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  generarProgramacionAction,
  editarCeldaCronogramaAction,
  crearCambioGuardiaAction,
  anularCambioGuardiaAction,
  type CrearCambioInput,
} from "@/app/panel/guardia/cronograma/actions";
import { AREAS_GUARDIA, type AreaGuardia, type EstadoCambioGuardia } from "@/lib/guardia/cronograma";
import { Icon } from "@/components/icon";

export interface SemanaFila {
  semanaInicio: string;
  semanaFin: string;
  usuarioId: string | null;
  nombre: string | null;
  esActual: boolean;
}

export interface CambioFila {
  id: string;
  tipo: "CUBRE" | "DEVUELVE";
  persona: string;
  original: string;
  desde: string;
  hasta: string;
  motivo: string | null;
  estado: EstadoCambioGuardia;
}

const ESTADO_LABEL: Record<EstadoCambioGuardia, string> = { pendiente: "Pendiente", aceptado: "Aceptado", rechazado: "No aceptado", anulado: "Anulado" };

function SelectorAnioArea({ anios, anio, area }: { anios: number[]; anio: number; area: AreaGuardia }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select value={anio} onChange={(e) => router.push(`/panel/guardia/cronograma?anio=${e.target.value}&area=${area}`)}>
        {anios.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <select value={area} onChange={(e) => router.push(`/panel/guardia/cronograma?anio=${anio}&area=${e.target.value}`)}>
        {AREAS_GUARDIA.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilaSemana({ fila, area, personas }: { fila: SemanaFila; area: AreaGuardia; personas: { id: string; nombre: string }[] }) {
  const [busy, setBusy] = useState(false);
  const [valor, setValor] = useState(fila.usuarioId ?? "");
  const [error, setError] = useState<string | null>(null);

  async function guardar(nuevoId: string) {
    setBusy(true);
    setError(null);
    const res = await editarCeldaCronogramaAction(fila.semanaInicio, area, nuevoId || null);
    setBusy(false);
    if (res.success) setValor(nuevoId);
    else setError(res.error || "No se pudo guardar.");
  }

  return (
    <div className="list-item" style={{ background: fila.esActual ? "var(--panel-2)" : undefined }}>
      <div className="info">
        <div>
          <div className="item-name">
            {fila.semanaInicio} → {fila.semanaFin} {fila.esActual && <span className="badge">Semana actual</span>}
          </div>
          {error && <div className="error-text">{error}</div>}
        </div>
      </div>
      <select value={valor} disabled={busy} onChange={(e) => guardar(e.target.value)}>
        <option value="">Sin asignar</option>
        {personas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

function FormCambio({ area, personas, onCreado }: { area: AreaGuardia; personas: { id: string; nombre: string }[]; onCreado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [original, setOriginal] = useState("");
  const [persona, setPersona] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [conDevolucion, setConDevolucion] = useState(false);
  const [devDesde, setDevDesde] = useState("");
  const [devHasta, setDevHasta] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    if (!original || !persona || !desde || !hasta) {
      setError("Completá quién no puede, quién cubre y las fechas.");
      return;
    }
    const input: CrearCambioInput = {
      area,
      originalId: original,
      personaId: persona,
      desde,
      hasta,
      motivo,
      devolucion: conDevolucion ? { desde: devDesde, hasta: devHasta } : null,
    };
    setBusy(true);
    setError(null);
    const res = await crearCambioGuardiaAction(input);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo registrar el cambio.");
      return;
    }
    setAbierto(false);
    setOriginal("");
    setPersona("");
    setDesde("");
    setHasta("");
    setMotivo("");
    setConDevolucion(false);
    setDevDesde("");
    setDevHasta("");
    onCreado();
  }

  if (!abierto) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAbierto(true)}>
        <Icon name="shuffle" size={13} /> Cambio de guardia
      </button>
    );
  }

  return (
    <div className="card" style={{ marginTop: 10, background: "var(--panel-2)" }}>
      <div className="tech-form-grid">
        <div className="field">
          <label>Quién no puede</label>
          <select value={original} onChange={(e) => setOriginal(e.target.value)} disabled={busy}>
            <option value="">Elegir...</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Quién cubre</label>
          <select value={persona} onChange={(e) => setPersona(e.target.value)} disabled={busy}>
            <option value="">Elegir...</option>
            {personas
              .filter((p) => p.id !== original)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="tech-form-grid">
        <div className="field">
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} disabled={busy} />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} disabled={busy} />
        </div>
      </div>
      <div className="field">
        <label>Motivo (opcional)</label>
        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={busy} />
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={conDevolucion} onChange={(e) => setConDevolucion(e.target.checked)} disabled={busy} />
        Con devolución (el que cubre también le debe un turno al otro)
      </label>
      {conDevolucion && (
        <div className="tech-form-grid" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Devolución desde</label>
            <input type="date" value={devDesde} onChange={(e) => setDevDesde(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label>Devolución hasta</label>
            <input type="date" value={devHasta} onChange={(e) => setDevHasta(e.target.value)} disabled={busy} />
          </div>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={crear} disabled={busy}>
          {busy ? "Guardando..." : "Registrar cambio"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAbierto(false)} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function CronogramaGuardiaCard({
  anios,
  anio,
  area,
  semanas,
  personasDelArea,
  cambios: cambiosIniciales,
}: {
  anios: number[];
  anio: number;
  area: AreaGuardia;
  semanas: SemanaFila[];
  personasDelArea: { id: string; nombre: string }[];
  cambios: CambioFila[];
}) {
  const router = useRouter();
  const [cambios, setCambios] = useState(cambiosIniciales);
  const [pisar, setPisar] = useState(false);
  const [areaGenerar, setAreaGenerar] = useState<AreaGuardia | "Todas">(area);
  const [generando, setGenerando] = useState(false);
  const [errorGenerar, setErrorGenerar] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);

  async function generar() {
    setGenerando(true);
    setErrorGenerar(null);
    const res = await generarProgramacionAction(areaGenerar, anio, pisar);
    setGenerando(false);
    if (!res.success) setErrorGenerar(res.error || "No se pudo generar.");
    else router.refresh();
  }

  async function anular(id: string) {
    setAnulandoId(id);
    const res = await anularCambioGuardiaAction(id);
    setAnulandoId(null);
    if (res.success) setCambios((prev) => prev.map((c) => (c.id === id ? { ...c, estado: "anulado" } : c)));
  }

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div className="section-label">Programación — {area}</div>
          <SelectorAnioArea anios={anios} anio={anio} area={area} />
        </div>
        <div className="item-list" style={{ marginTop: 10 }}>
          {semanas.map((s) => (
            <FilaSemana key={s.semanaInicio} fila={s} area={area} personas={personasDelArea} />
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Generar programación anual</div>
        <div className="tech-form-grid" style={{ marginTop: 10 }}>
          <select value={areaGenerar} onChange={(e) => setAreaGenerar(e.target.value as AreaGuardia | "Todas")} disabled={generando}>
            <option value="Todas">Todas las áreas</option>
            {AREAS_GUARDIA.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <label className="checkbox-row">
            <input type="checkbox" checked={pisar} onChange={(e) => setPisar(e.target.checked)} disabled={generando} />
            Pisar lo ya cargado
          </label>
        </div>
        {errorGenerar && <div className="error-text">{errorGenerar}</div>}
        <button type="button" className="btn btn-primary btn-sm" onClick={generar} disabled={generando} style={{ marginTop: 10 }}>
          {generando ? "Generando..." : `Generar ${anio}`}
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Cambios de guardia — {area}</div>
        <FormCambio area={area} personas={personasDelArea} onCreado={() => router.refresh()} />
        <div className="item-list" style={{ marginTop: 10 }}>
          {cambios
            .filter((c) => c.tipo === "CUBRE")
            .map((c) => (
              <div className="list-item" key={c.id}>
                <div className="info">
                  <div>
                    <div className="item-name">
                      {c.persona} cubre a {c.original} <span className="badge">{ESTADO_LABEL[c.estado]}</span>
                    </div>
                    <div className="item-sub">
                      {c.desde} → {c.hasta}
                      {c.motivo ? ` · ${c.motivo}` : ""}
                    </div>
                  </div>
                </div>
                {(c.estado === "pendiente" || c.estado === "aceptado") && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => anular(c.id)} disabled={anulandoId === c.id} title="Anular">
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
            ))}
          {cambios.length === 0 && <p className="empty-note">No hay cambios de guardia registrados para esta área.</p>}
        </div>
        <p className="empty-note" style={{ marginTop: 10 }}>
          Un cambio queda &quot;Pendiente&quot; hasta que quien tiene que cubrir lo acepte desde su celular — esa pantalla todavía no
          está construida (próxima fase), así que por ahora no rige el cronograma hasta que se acepte de otra forma.
        </p>
      </div>
    </>
  );
}
