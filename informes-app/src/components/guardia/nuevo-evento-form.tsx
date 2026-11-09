"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearEventoAction } from "@/app/(app)/guardia/nuevo/actions";
import type { TipoAlarmaGuardia, TicketTipoGuardia } from "@/lib/database.types";

const TIPOS_ALARMA: TipoAlarmaGuardia[] = ["Grupo electrógeno", "Router", "UPS", "Otro"];
const TIPOS_TICKET: TicketTipoGuardia[] = ["Incidencia", "Ticket", "Tarea de cambio"];

export function NuevoEventoGuardiaForm() {
  const router = useRouter();
  const [tipoAlarma, setTipoAlarma] = useState<TipoAlarmaGuardia>("Grupo electrógeno");
  const [sitio, setSitio] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [ticketTipo, setTicketTipo] = useState<TicketTipoGuardia>("Incidencia");
  const [ticketNumero, setTicketNumero] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registrar() {
    if (!sitio.trim() || !descripcion.trim()) {
      setError("Completá el sitio y qué comentó operación central.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("payload", JSON.stringify({ tipoAlarma, sitio, descripcion, ticketTipo, ticketNumero }));
    const res = await crearEventoAction(fd);
    setBusy(false);
    if (!res.success || !res.eventoId) {
      setError(res.error || "No se pudo registrar el evento.");
      return;
    }
    router.push(`/guardia/evento/${res.eventoId}`);
  }

  return (
    <div className="card">
      <div className="field">
        <label>Tipo de alarma</label>
        <select value={tipoAlarma} onChange={(e) => setTipoAlarma(e.target.value as TipoAlarmaGuardia)} disabled={busy}>
          {TIPOS_ALARMA.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Sitio</label>
        <input type="text" value={sitio} onChange={(e) => setSitio(e.target.value)} disabled={busy} placeholder="Nombre del sitio" />
      </div>
      <div className="field">
        <label>¿Qué comentó operación central?</label>
        <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={busy} rows={3} />
      </div>
      <div className="tech-form-grid">
        <div className="field">
          <label>Tipo de ticket</label>
          <select value={ticketTipo} onChange={(e) => setTicketTipo(e.target.value as TicketTipoGuardia)} disabled={busy}>
            {TIPOS_TICKET.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Número de ticket (opcional)</label>
          <input type="text" value={ticketNumero} onChange={(e) => setTicketNumero(e.target.value)} disabled={busy} />
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <button type="button" className="btn btn-primary" onClick={registrar} disabled={busy}>
        {busy ? "Registrando..." : "Registrar llamada"}
      </button>
    </div>
  );
}
