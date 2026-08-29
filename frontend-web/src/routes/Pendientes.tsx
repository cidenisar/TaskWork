// Ver Cowork "Administración de Padrón de Personas" (pestaña
// "Pendientes de aprobación") y backend-server/README.md ("Aprobar/
// rechazar un autoregistro"). Acciones inmediatas, sin paso de
// confirmación — mismo criterio que el wireframe: es una cola chica
// que un admin revisa seguido, no una baja destructiva.

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listarPendientes, aprobarPersona, rechazarPersona, type PersonaPendiente } from "../lib/personas";
import { tiempoRelativo } from "../lib/tiempoRelativo";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import "./Pendientes.css";

function iniciales(nombre: string): string {
  return nombre
    .replace(/[^A-Za-zÀ-ÿ ]/g, "")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Pendientes() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [filas, setFilas] = useState<PersonaPendiente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accionEnCursoId, setAccionEnCursoId] = useState<string | null>(null);

  async function cargar(organizacionId: string) {
    setError(null);
    try {
      setFilas(await listarPendientes(organizacionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista de pendientes.");
    }
  }

  useEffect(() => {
    if (!operador) return;
    void cargar(operador.organizacionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  if (!operador) return null;

  async function onAprobar(p: PersonaPendiente) {
    if (!operador) return;
    setAccionEnCursoId(p.id);
    try {
      const resultado = await aprobarPersona(p.id);
      if (!resultado.ok) {
        mostrar(resultado.error);
        return;
      }
      setFilas((prev) => (prev ? prev.filter((x) => x.id !== p.id) : prev));
      if (resultado.notificado) {
        mostrar(`"${p.nombre}" aprobado y sumado al padrón activo — avisado por push.`);
      } else {
        mostrar(`"${p.nombre}" aprobado y sumado al padrón activo. No se le pudo avisar por push${resultado.errorNotificacion ? `: ${resultado.errorNotificacion}` : " todavía (sin push_token)"}.`);
      }
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado aprobando la solicitud.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  async function onRechazar(p: PersonaPendiente) {
    setAccionEnCursoId(p.id);
    try {
      const resultado = await rechazarPersona(p.id);
      if (!resultado.ok) {
        mostrar(resultado.error);
        return;
      }
      setFilas((prev) => (prev ? prev.filter((x) => x.id !== p.id) : prev));
      mostrar(`Solicitud de "${p.nombre}" rechazada.`);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado rechazando la solicitud.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  return (
    <div className="app">
      <Topbar titulo="Pendientes de aprobación" />
      <main>
        <div className="intro">
          <div className="eyebrow">Administración · autoregistro de personal</div>
          <p>
            Personal <b>fijo</b> que abrió la app y no encontró su legajo/DNI en el padrón — completó sus datos y queda acá hasta que un
            admin lo confirme. Aprobar lo suma al padrón activo y le avisa por push si ya tiene la app instalada; rechazar descarta la
            solicitud.
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar la lista: {error}</div>}
        {!error && filas === null && <div className="empty">Cargando…</div>}
        {!error && filas !== null && filas.length === 0 && (
          <div className="empty">No hay solicitudes de alta pendientes en este momento.</div>
        )}
        {!error && filas !== null && filas.length > 0 && (
          <div className="list">
            {filas.map((p) => (
              <div className="pend-row" key={p.id}>
                <div className="p-id">
                  <div className="p-av">{iniciales(p.nombre)}</div>
                  <div>
                    <div className="p-name">{p.nombre}</div>
                    <div className="p-sub">
                      DNI {p.dni} · {p.telefono}
                    </div>
                  </div>
                </div>
                <div className="site-chip-sm">{p.sitioNombre}</div>
                <div className="pend-when">Solicitado {tiempoRelativo(p.creadaEn)}</div>
                <div className="row-actions">
                  <button className="icon-btn bad" type="button" disabled={accionEnCursoId === p.id} onClick={() => void onRechazar(p)}>
                    <svg viewBox="0 0 24 24">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    Rechazar
                  </button>
                  <button className="icon-btn good" type="button" disabled={accionEnCursoId === p.id} onClick={() => void onAprobar(p)}>
                    <svg viewBox="0 0 24 24">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Toast mensaje={mensaje} />
    </div>
  );
}
