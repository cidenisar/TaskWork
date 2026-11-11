"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearEventoAction } from "@/app/(app)/guardia/nuevo/actions";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import type { Ubicacion } from "@/components/ubicaciones/types";
import { linkWhatsappGrupo } from "@/lib/guardia/whatsapp";
import type { TipoAlarmaGuardia, TicketTipoGuardia } from "@/lib/database.types";

const TIPOS_ALARMA: TipoAlarmaGuardia[] = ["Grupo electrógeno", "Router", "UPS", "Otro"];
const TIPOS_TICKET: TicketTipoGuardia[] = ["Incidencia", "Ticket", "Tarea de cambio"];

export function NuevoEventoGuardiaForm({ provincias, ubicaciones }: { provincias: string[]; ubicaciones: Ubicacion[] }) {
  const router = useRouter();
  const [tipoAlarma, setTipoAlarma] = useState<TipoAlarmaGuardia>("Grupo electrógeno");
  const [provinciaFiltro, setProvinciaFiltro] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [localidadNueva, setLocalidadNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [plantaNueva, setPlantaNueva] = useState("");
  const [oficinaNueva, setOficinaNueva] = useState("");
  const [gps, setGps] = useState<GpsCapturado | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [ticketTipo, setTicketTipo] = useState<TicketTipoGuardia>("Incidencia");
  const [ticketNumero, setTicketNumero] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function registrar() {
    if (!ubicacionId || !descripcion.trim()) {
      setError("Completá el sitio y qué comentó operación central.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set(
      "payload",
      JSON.stringify({
        tipoAlarma,
        ubicacionId: ubicacionId === "__new" ? null : ubicacionId,
        ubicacionNueva:
          ubicacionId === "__new"
            ? { provincia: provinciaFiltro, localidad: localidadNueva, sitio: sitioNueva, planta: plantaNueva, oficina: oficinaNueva }
            : null,
        gps,
        descripcion,
        ticketTipo,
        ticketNumero,
      }),
    );
    const res = await crearEventoAction(fd);
    setBusy(false);
    if (!res.success || !res.eventoId) {
      setError(res.error || "No se pudo registrar el evento.");
      return;
    }
    const textoLlamada = [
      `#${(res.numero ?? 0).toString().padStart(4, "0")} · ${tipoAlarma} — ${res.sitio ?? ""}`,
      descripcion,
      `${ticketTipo}${ticketNumero ? ` #${ticketNumero}` : ""}`,
    ].join("\n");
    window.open(linkWhatsappGrupo(textoLlamada), "_blank");
    router.push("/guardia");
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
