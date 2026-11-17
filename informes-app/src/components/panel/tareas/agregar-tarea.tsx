"use client";

import { useEffect, useState } from "react";
import { buscarUbicacionesParaTareaAction, crearTareaAction, type UbicacionParaTarea } from "@/app/panel/tareas/actions";

/**
 * Carga una tarea (o varias, una por línea) en un sitio sin pasar por un informe. Con `sitio` fijo
 * (botón dentro de un grupo) no pide el sitio; sin él (botón de arriba) lo busca por nombre.
 */
export function AgregarTarea({ sitio, compacto = false }: { sitio?: UbicacionParaTarea; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<UbicacionParaTarea | null>(sitio ?? null);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<UbicacionParaTarea[]>([]);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || elegido || query.trim().length < 2) return;
    let cancelado = false;
    const t = setTimeout(() => {
      buscarUbicacionesParaTareaAction(query)
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
  }, [abierto, elegido, query]);

  function cerrar() {
    setAbierto(false);
    setTexto("");
    setQuery("");
    setResultados([]);
    setError(null);
    setElegido(sitio ?? null);
  }

  async function guardar() {
    if (!elegido) return;
    setBusy(true);
    setError(null);
    try {
      const res = await crearTareaAction(elegido.id, texto);
      if (!res.success) setError(res.error ?? "No se pudo guardar.");
      else cerrar();
    } catch {
      setError("No se pudo guardar — probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!abierto) {
    return (
      <button type="button" className={compacto ? "btn btn-secondary btn-sm" : "btn btn-primary"} onClick={() => setAbierto(true)}>
        + Agregar tarea
      </button>
    );
  }

  return (
    <div className="tarea-nueva">
      {elegido ? (
        <div className="tarea-nueva-sitio">
          <strong>{elegido.label}</strong>
          {!sitio && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setElegido(null)}>
              Cambiar sitio
            </button>
          )}
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar el sitio (nombre, localidad, provincia)"
            aria-label="Buscar sitio"
            autoFocus
          />
          {query.trim().length >= 2 && resultados.length === 0 && <div className="item-sub">Sin resultados.</div>}
          {resultados.length > 0 && (
            <ul className="tarea-equipo-resultados">
              {resultados.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setElegido(r)}>
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {elegido && (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={"Una tarea por línea, ej:\nCambiar batería del UPS\nRevisar puesta a tierra"}
          rows={3}
          disabled={busy}
          aria-label="Tareas a agregar"
          autoFocus
        />
      )}
      <div className="tarea-cierre-botones">
        {elegido && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !texto.trim()} onClick={guardar}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={cerrar}>
          Cancelar
        </button>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
