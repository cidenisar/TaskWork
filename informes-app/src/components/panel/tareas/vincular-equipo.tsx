"use client";

import { useEffect, useState } from "react";
import { buscarEquiposParaTareaAction, vincularEquipoAction, type EquipoParaTarea } from "@/app/panel/tareas/actions";
import type { TipoEquipoBaja } from "@/lib/database.types";

/**
 * Vínculo de una tarea abierta con un equipo del sitio. Si el equipo se da de
 * baja, la tarea se cierra sola. Con equipo: muestra cuál es y permite quitarlo;
 * sin equipo: buscador por texto, marca, modelo o serie.
 */
export function VincularEquipo({
  tareaId,
  ubicacionId,
  equipo,
}: {
  tareaId: string;
  ubicacionId: string;
  equipo: { tipo: TipoEquipoBaja; id: string; texto: string } | null;
}) {
  const [buscando, setBuscando] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<EquipoParaTarea[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!buscando || query.trim().length < 2) return;
    let cancelado = false;
    const t = setTimeout(() => {
      buscarEquiposParaTareaAction(ubicacionId, query)
        .then((r) => {
          if (!cancelado) setResultados(r);
        })
        .catch(() => {
          if (!cancelado) setResultados([]);
        });
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [buscando, query, ubicacionId]);

  async function guardar(e: { tipo: TipoEquipoBaja; id: string } | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await vincularEquipoAction(tareaId, e);
      if (!res.success) setError(res.error ?? "No se pudo guardar.");
      else {
        setBuscando(false);
        setQuery("");
        setResultados([]);
      }
    } catch {
      setError("No se pudo guardar — probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (equipo) {
    return (
      <div className="tarea-equipo">
        <span>
          Equipo: <strong>{equipo.texto}</strong> <span className="item-sub">(si se da de baja, la tarea se cierra sola)</span>
        </span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => guardar(null)}>
          Quitar vínculo
        </button>
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  if (!buscando) {
    return (
      <div className="tarea-equipo">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBuscando(true)}>
          Vincular a un equipo
        </button>
      </div>
    );
  }

  const hayBusqueda = query.trim().length >= 2;
  return (
    <div className="tarea-equipo tarea-equipo-buscador">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar equipo del sitio (nombre, marca, serie)"
        aria-label="Buscar equipo"
        disabled={busy}
        autoFocus
      />
      {hayBusqueda && resultados.length === 0 && <div className="item-sub">Sin resultados en este sitio.</div>}
      {hayBusqueda && resultados.length > 0 && (
        <ul className="tarea-equipo-resultados">
          {resultados.map((r) => (
            <li key={`${r.tipo}-${r.id}`}>
              <button type="button" disabled={busy} onClick={() => guardar({ tipo: r.tipo, id: r.id })}>
                <strong>{r.texto}</strong>
                <span className="item-sub"> · {r.detalle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBuscando(false)}>
        Cancelar
      </button>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
