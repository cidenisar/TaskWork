// Administración de Sitios — alta y renombrado. Ver ROADMAP.md ("Gestión
// de sitios / consolas / PROG1-4") y lib/sitios.ts para el porqué de lo
// que NO se construyó acá (adaptador de control de accesos, mapa/geofence,
// baja).
//
// Solo para admins de alcance "organización" — mismo guardado de
// aplicación que ya usa Panorama de Sitios (RLS no distingue
// `alcance_tipo`, solo organización — ver backend-server/README.md).
// Un admin de alcance "sitio" no ve el link en la nav (Topbar ya lo
// oculta) pero nada le impide teclear /sitios directo.

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { listarSitiosAdmin, crearSitio, actualizarSitio, type SitioAdmin } from "../lib/sitios";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import "./Puntos.css";

interface FormularioDrawer {
  editingId: string | null;
  nombre: string;
}

export function Sitios() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [sitios, setSitios] = useState<SitioAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FormularioDrawer | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    if (!operador) return;
    setError(null);
    try {
      setSitios(await listarSitiosAdmin(operador.organizacionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la lista de sitios.");
    }
  }

  useEffect(() => {
    if (!operador || operador.alcanceTipo !== "organizacion") return;
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  if (!operador) return null;
  if (operador.alcanceTipo !== "organizacion") return <Navigate to="/" replace />;

  function abrirAlta() {
    setDrawer({ editingId: null, nombre: "" });
  }
  function abrirEdicion(s: SitioAdmin) {
    setDrawer({ editingId: s.id, nombre: s.nombre });
  }

  async function guardarDrawer() {
    if (!drawer || !operador) return;
    const nombre = drawer.nombre.trim();
    if (!nombre) {
      mostrar("Falta el nombre del sitio.");
      return;
    }
    setGuardando(true);
    try {
      if (drawer.editingId) {
        await actualizarSitio(drawer.editingId, nombre);
        mostrar("Cambios guardados.");
      } else {
        await crearSitio(operador.organizacionId, nombre);
        mostrar(`"${nombre}" agregado.`);
      }
      setDrawer(null);
      await cargar();
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando los cambios.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="app">
      <Topbar titulo="Sitios" />
      <main>
        <div className="intro">
          <div className="eyebrow">Administración · configuración de organización</div>
          <p>
            Las plantas/ubicaciones físicas de <b>toda la organización</b> — cada sitio tiene sus propias consolas, puntos de encuentro y
            personal. No se puede borrar un sitio desde acá (queda ligado a demasiado historial real) — si hace falta, es una operación de
            base de datos aparte.
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar: {error}</div>}

        {!error && sitios === null && <div className="empty">Cargando sitios…</div>}

        {!error && sitios !== null && (
          <>
            <div className="toolbar">
              <div className="tb-count">
                <b>{sitios.length}</b> sitio{sitios.length === 1 ? "" : "s"} en la organización
              </div>
              <button className="btn-primary" type="button" onClick={abrirAlta}>
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Agregar sitio
              </button>
            </div>

            {sitios.length === 0 ? (
              <div className="empty">Esta organización todavía no tiene ningún sitio cargado.</div>
            ) : (
              <div className="list">
                {sitios.map((s) => (
                  <div className="point-row" key={s.id}>
                    <div className="pr-main">
                      <div className="pr-name">{s.nombre}</div>
                    </div>
                    <div className="row-actions">
                      <button className="icon-btn" type="button" onClick={() => abrirEdicion(s)}>
                        <svg viewBox="0 0 24 24">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                        Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.editingId ? "Editar sitio" : "Agregar sitio"}
        footer={
          <>
            <button className="btn-ghost" type="button" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button className="btn-primary" type="button" disabled={guardando} onClick={() => void guardarDrawer()}>
              {guardando ? "Guardando…" : drawer?.editingId ? "Guardar cambios" : "Agregar sitio"}
            </button>
          </>
        }
      >
        {drawer && (
          <div className="dfield">
            <label htmlFor="fNombre">Nombre</label>
            <input
              id="fNombre"
              type="text"
              value={drawer.nombre}
              placeholder="ej. Planta de Refinación Principal"
              onChange={(e) => setDrawer({ ...drawer, nombre: e.target.value })}
            />
          </div>
        )}
      </Drawer>

      <Toast mensaje={mensaje} />
    </div>
  );
}
