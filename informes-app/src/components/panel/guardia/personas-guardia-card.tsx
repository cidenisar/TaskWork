"use client";

import { useState } from "react";
import { asignarAreaDeGuardiaAction } from "@/app/panel/guardia/personas/actions";
import { AREAS_GUARDIA, type AreaGuardia } from "@/lib/guardia/cronograma";
import { Icon } from "@/components/icon";

export interface PersonaGuardiaRow {
  id: string;
  nombreCompleto: string;
  telefono: string | null;
  activo: boolean;
  /** Puede cubrir más de un área a la vez (su sector + la General) — pedido de Ivan, 12/11. */
  areas: { area: AreaGuardia; orden: number }[];
}

export function PersonasGuardiaCard({ personas: initial }: { personas: PersonaGuardiaRow[] }) {
  const [personas, setPersonas] = useState(initial);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<Record<string, string>>({});
  const [ordenEdit, setOrdenEdit] = useState<Record<string, string>>({});

  function ordenDe(p: PersonaGuardiaRow, area: AreaGuardia): number {
    return p.areas.find((a) => a.area === area)?.orden ?? 0;
  }

  async function guardar(p: PersonaGuardiaRow, area: AreaGuardia, activo: boolean, ordenNuevo: number) {
    const key = `${p.id}:${area}`;
    const anterior = p.areas;
    setBusyKey(key);
    setErrorId((prev) => ({ ...prev, [key]: "" }));
    setPersonas((prev) =>
      prev.map((x) =>
        x.id === p.id
          ? { ...x, areas: activo ? [...x.areas.filter((a) => a.area !== area), { area, orden: ordenNuevo }] : x.areas.filter((a) => a.area !== area) }
          : x,
      ),
    );
    const res = await asignarAreaDeGuardiaAction(p.id, p.nombreCompleto, area, activo, ordenNuevo);
    setBusyKey(null);
    if (!res.success) {
      setPersonas((prev) => prev.map((x) => (x.id === p.id ? { ...x, areas: anterior } : x)));
      setErrorId((prev) => ({ ...prev, [key]: res.error || "No se pudo guardar." }));
    }
  }

  function toggleArea(p: PersonaGuardiaRow, area: AreaGuardia, activo: boolean) {
    guardar(p, area, activo, ordenDe(p, area) || 1);
  }

  function commitOrden(p: PersonaGuardiaRow, area: AreaGuardia) {
    const campo = `${p.id}:${area}`;
    const texto = ordenEdit[campo];
    setOrdenEdit((prev) => {
      const next = { ...prev };
      delete next[campo];
      return next;
    });
    if (texto === undefined) return;
    const valor = Number(texto);
    if (!Number.isFinite(valor) || valor === ordenDe(p, area)) return;
    guardar(p, area, true, valor);
  }

  const activos = personas.filter((p) => p.activo);
  const sinTelefono = activos.filter((p) => p.areas.length > 0 && !p.telefono);

  return (
    <div className="card">
      <div className="section-label">Personas de guardia</div>
      <p className="empty-note" style={{ marginBottom: 12 }}>
        Solo técnicos activos. &quot;General&quot; es la guardia general (atiende las llamadas); Infraestructura, Datos y Enlaces son
        las guardias técnicas. Un técnico puede cubrir su sector y además la General. Un cambio rehace el cronograma desde la semana
        que viene para esa área — lo ya pasado y la semana en curso no se tocan.
      </p>
      {sinTelefono.length > 0 && (
        <div className="error-text" style={{ marginBottom: 12 }}>
          <Icon name="warning" size={13} /> {sinTelefono.length === 1 ? "1 persona de guardia no tiene" : `${sinTelefono.length} personas de guardia no tienen`}{" "}
          teléfono de WhatsApp cargado (Configuración → Usuarios): no se les va a poder avisar por ese canal.
        </div>
      )}

      <div className="item-list">
        {activos.map((p) => (
          <div className="list-item" key={p.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <div className="info">
              <div className="avatar">{(p.nombreCompleto[0] || "?").toUpperCase()}</div>
              <div>
                <div className="item-name">{p.nombreCompleto}</div>
                <div className="item-sub">{p.telefono || "Sin teléfono de WhatsApp"}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: 44 }}>
              {AREAS_GUARDIA.map((area) => {
                const activa = p.areas.some((a) => a.area === area);
                const busy = busyKey === `${p.id}:${area}`;
                return (
                  <label key={area} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="checkbox" checked={activa} disabled={busy} onChange={(e) => toggleArea(p, area, e.target.checked)} />
                    {area}
                    {activa && (
                      <input
                        type="number"
                        className="input-chico"
                        value={ordenEdit[`${p.id}:${area}`] ?? String(ordenDe(p, area))}
                        onChange={(e) => setOrdenEdit((prev) => ({ ...prev, [`${p.id}:${area}`]: e.target.value }))}
                        onBlur={() => commitOrden(p, area)}
                        disabled={busy}
                        title={`Orden de rotación dentro de ${area}`}
                        onWheel={(e) => e.currentTarget.blur()}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            {Object.entries(errorId)
              .filter(([k, v]) => k.startsWith(`${p.id}:`) && v)
              .map(([k, v]) => (
                <div className="error-text" key={k}>
                  {v}
                </div>
              ))}
          </div>
        ))}
        {activos.length === 0 && <p className="empty-note">No hay técnicos activos cargados todavía.</p>}
      </div>
    </div>
  );
}
