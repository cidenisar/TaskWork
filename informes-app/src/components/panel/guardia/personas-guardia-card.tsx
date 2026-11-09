"use client";

import { useState } from "react";
import { asignarPersonaDeGuardiaAction } from "@/app/panel/guardia/personas/actions";
import { AREAS_GUARDIA, type AreaGuardia } from "@/lib/guardia/cronograma";
import { Icon } from "@/components/icon";

export interface PersonaGuardiaRow {
  id: string;
  nombreCompleto: string;
  telefono: string | null;
  activo: boolean;
  area: AreaGuardia | null;
  orden: number;
}

const SIN_GUARDIA = "SIN_GUARDIA";

export function PersonasGuardiaCard({ personas: initial }: { personas: PersonaGuardiaRow[] }) {
  const [personas, setPersonas] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<Record<string, string>>({});
  const [ordenEdit, setOrdenEdit] = useState<Record<string, string>>({});

  async function guardar(p: PersonaGuardiaRow, areaNueva: AreaGuardia | null, ordenNuevo: number) {
    const anterior = { area: p.area, orden: p.orden };
    setBusyId(p.id);
    setErrorId((prev) => ({ ...prev, [p.id]: "" }));
    setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, area: areaNueva, orden: ordenNuevo } : x)));
    const res = await asignarPersonaDeGuardiaAction(p.id, p.nombreCompleto, areaNueva, ordenNuevo);
    setBusyId(null);
    if (!res.success) {
      setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...anterior } : x)));
      setErrorId((prev) => ({ ...prev, [p.id]: res.error || "No se pudo guardar." }));
    }
  }

  function cambiarArea(p: PersonaGuardiaRow, valor: string) {
    const areaNueva = valor === SIN_GUARDIA ? null : (valor as AreaGuardia);
    if (areaNueva === p.area) return;
    guardar(p, areaNueva, p.orden);
  }

  function commitOrden(p: PersonaGuardiaRow) {
    const texto = ordenEdit[p.id];
    setOrdenEdit((prev) => {
      const next = { ...prev };
      delete next[p.id];
      return next;
    });
    if (texto === undefined) return;
    const valor = Number(texto);
    if (!Number.isFinite(valor) || valor === p.orden) return;
    guardar(p, p.area, valor);
  }

  const activos = personas.filter((p) => p.activo);
  const sinTelefono = activos.filter((p) => p.area !== null && !p.telefono);

  return (
    <div className="card">
      <div className="section-label">Personas de guardia</div>
      <p className="empty-note" style={{ marginBottom: 12 }}>
        Solo técnicos activos. &quot;General&quot; es la guardia general (atiende las llamadas); Infraestructura, Datos y Enlaces son
        las guardias técnicas. Un cambio rehace el cronograma desde la semana que viene para el área que la persona deja y la que
        entra — lo ya pasado y la semana en curso no se tocan.
      </p>
      {sinTelefono.length > 0 && (
        <div className="error-text" style={{ marginBottom: 12 }}>
          <Icon name="warning" size={13} /> {sinTelefono.length === 1 ? "1 persona de guardia no tiene" : `${sinTelefono.length} personas de guardia no tienen`}{" "}
          teléfono de WhatsApp cargado (Configuración → Usuarios): no se les va a poder avisar por ese canal.
        </div>
      )}

      <div className="item-list">
        {activos.map((p) => {
          const busy = busyId === p.id;
          return (
            <div className="list-item" key={p.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: 8 }}>
                <div className="info">
                  <div className="avatar">{(p.nombreCompleto[0] || "?").toUpperCase()}</div>
                  <div>
                    <div className="item-name">{p.nombreCompleto}</div>
                    <div className="item-sub">{p.telefono || "Sin teléfono de WhatsApp"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {p.area && (
                    <input
                      type="number"
                      value={ordenEdit[p.id] ?? String(p.orden)}
                      onChange={(e) => setOrdenEdit((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      onBlur={() => commitOrden(p)}
                      disabled={busy}
                      title="Orden de rotación dentro del área"
                      style={{ width: 60 }}
                    />
                  )}
                  <select value={p.area ?? SIN_GUARDIA} disabled={busy} onChange={(e) => cambiarArea(p, e.target.value)}>
                    <option value={SIN_GUARDIA}>Sin guardia</option>
                    {AREAS_GUARDIA.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {errorId[p.id] && <div className="error-text">{errorId[p.id]}</div>}
            </div>
          );
        })}
        {activos.length === 0 && <p className="empty-note">No hay técnicos activos cargados todavía.</p>}
      </div>
    </div>
  );
}
