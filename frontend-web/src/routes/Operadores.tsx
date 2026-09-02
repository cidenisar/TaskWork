// Ver Cowork "Administración de Operadores" y backend-server/README.md
// ("Alta de operadores y login web para admins"). Alta y reseteo de PIN
// pasan por backend-server; editar/dar de baja/reactivar son escritura
// directa contra Supabase (ver lib/operadores.ts para el porqué de cada
// uno).

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import {
  listarOperadores,
  listarSitiosDeOrganizacion,
  crearOperador,
  resetearPin,
  actualizarOperador,
  cambiarEstadoOperador,
  type OperadorFila,
  type SitioOpcion,
  type RolOperador,
} from "../lib/operadores";
import type { AlcanceTipo } from "../lib/auth";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import "./Operadores.css";

interface FormularioDrawer {
  editingId: string | null;
  nombre: string;
  legajo: string;
  rol: RolOperador;
  alcanceTipo: AlcanceTipo;
  sitiosIds: string[];
  email: string;
}

interface PinRevelado {
  operadorId: string;
  pin: string;
  invitado?: boolean;
  errorInvitacion?: string;
}

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

export function Operadores() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [filas, setFilas] = useState<OperadorFila[] | null>(null);
  const [sitiosOpciones, setSitiosOpciones] = useState<SitioOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [confirmandoBajaId, setConfirmandoBajaId] = useState<string | null>(null);
  const [pinRevelado, setPinRevelado] = useState<PinRevelado | null>(null);
  const [drawer, setDrawer] = useState<FormularioDrawer | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [accionEnCursoId, setAccionEnCursoId] = useState<string | null>(null);

  async function cargar(organizacionId: string) {
    setError(null);
    try {
      const [ops, sitios] = await Promise.all([listarOperadores(organizacionId), listarSitiosDeOrganizacion(organizacionId)]);
      setFilas(ops);
      setSitiosOpciones(sitios);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el padrón de operadores.");
    }
  }

  useEffect(() => {
    if (!operador) return;
    void cargar(operador.organizacionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  const filtradas = useMemo(() => {
    if (!filas) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) => f.nombre.toLowerCase().includes(q) || (f.legajo ?? "").toLowerCase().includes(q));
  }, [filas, busqueda]);

  if (!operador) return null;

  function abrirAlta() {
    setDrawer({ editingId: null, nombre: "", legajo: "", rol: "operador", alcanceTipo: "sitio", sitiosIds: [], email: "" });
  }
  function abrirEdicion(f: OperadorFila) {
    setDrawer({
      editingId: f.id,
      nombre: f.nombre,
      legajo: f.legajo ?? "",
      rol: f.rol,
      alcanceTipo: f.alcanceTipo,
      sitiosIds: f.sitios.map((s) => s.id),
      email: "",
    });
  }

  async function guardarDrawer() {
    if (!drawer || !operador) return;
    const nombre = drawer.nombre.trim();
    if (!nombre) {
      mostrar("Falta el nombre.");
      return;
    }
    if (drawer.alcanceTipo === "sitio" && drawer.sitiosIds.length === 0) {
      mostrar('Elegí al menos un sitio, o marcá "Toda la organización".');
      return;
    }
    setGuardando(true);
    try {
      if (drawer.editingId) {
        await actualizarOperador(drawer.editingId, {
          nombre,
          legajo: drawer.legajo.trim() || null,
          rol: drawer.rol,
          alcanceTipo: drawer.alcanceTipo,
          sitiosIds: drawer.alcanceTipo === "sitio" ? drawer.sitiosIds : [],
        });
        setDrawer(null);
        mostrar("Cambios guardados.");
        await cargar(operador.organizacionId);
      } else {
        const resultado = await crearOperador({
          nombre,
          legajo: drawer.legajo.trim() || null,
          rol: drawer.rol,
          alcanceTipo: drawer.alcanceTipo,
          sitiosIds: drawer.alcanceTipo === "sitio" ? drawer.sitiosIds : [],
          email: drawer.rol === "admin" && drawer.email.trim() ? drawer.email.trim() : null,
        });
        if (!resultado.ok) {
          mostrar(resultado.error);
          return;
        }
        setDrawer(null);
        await cargar(operador.organizacionId);
        setPinRevelado({ operadorId: resultado.id, pin: resultado.pin, invitado: resultado.invitado, errorInvitacion: resultado.errorInvitacion });
      }
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando los cambios.");
    } finally {
      setGuardando(false);
    }
  }

  async function onResetearPin(f: OperadorFila) {
    setAccionEnCursoId(f.id);
    try {
      const resultado = await resetearPin(f.id);
      if (!resultado.ok) {
        mostrar(resultado.error);
        return;
      }
      setPinRevelado({ operadorId: f.id, pin: resultado.pin });
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado reseteando el PIN.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  async function confirmarBaja(f: OperadorFila) {
    if (!operador) return;
    setAccionEnCursoId(f.id);
    try {
      await cambiarEstadoOperador(f.id, "de_baja");
      setConfirmandoBajaId(null);
      mostrar(`"${f.nombre}" dado de baja.`);
      await cargar(operador.organizacionId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado dando de baja al operador.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  async function reactivar(f: OperadorFila) {
    if (!operador) return;
    setAccionEnCursoId(f.id);
    try {
      await cambiarEstadoOperador(f.id, "activo");
      mostrar(`"${f.nombre}" reactivado.`);
      await cargar(operador.organizacionId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado reactivando al operador.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  const activos = filas ? filas.filter((f) => f.estado === "activo").length : 0;

  return (
    <div className="app">
      <Topbar titulo="Operadores" />
      <main>
        <div className="intro">
          <div className="eyebrow">Administración · padrón de operadores y roles</div>
          <p>
            Alta, baja, rol y reseteo de PIN de quienes pueden habilitar una Consola Disparadora. Cada operador tiene además un{" "}
            <b>alcance</b>: uno o varios sitios puntuales, o toda la organización.
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar el padrón: {error}</div>}

        {!error && filas === null && <div className="empty">Cargando operadores…</div>}

        {!error && filas !== null && (
          <>
            <div className="toolbar">
              <div className="tb-count">
                <b>{activos}</b> de {filas.length} operadores activos
              </div>
              <div className="toolbar-right">
                <input className="search" placeholder="Buscar por nombre o legajo…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                <button className="btn-primary" type="button" onClick={abrirAlta}>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Agregar operador
                </button>
              </div>
            </div>

            {filtradas.length === 0 ? (
              <div className="empty">Sin resultados para esa búsqueda.</div>
            ) : (
              <div className="list">
                {filtradas.map((f) => {
                  if (confirmandoBajaId === f.id) {
                    return (
                      <div className="op-row" key={f.id}>
                        <div className="confirm-row">
                          <div className="cr-text">
                            ¿Dar de baja a <b>{f.nombre}</b>? Pierde acceso a la consola física y, si tenía login web, también a Frontend Web al instante.
                          </div>
                          <div className="cr-actions">
                            <button className="btn-ghost" type="button" onClick={() => setConfirmandoBajaId(null)}>
                              Cancelar
                            </button>
                            <button className="btn-danger" type="button" disabled={accionEnCursoId === f.id} onClick={() => void confirmarBaja(f)}>
                              Dar de baja
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  if (pinRevelado?.operadorId === f.id) {
                    return (
                      <div className="op-row" key={f.id}>
                        <div className="pin-reveal">
                          <span className="pv-text">
                            PIN nuevo para <b>{f.nombre}</b> — se muestra <b>una sola vez</b>, después queda hasheado igual que los demás:
                          </span>
                          <span className="pv-pin">{pinRevelado.pin}</span>
                          <button className="btn-ghost" type="button" onClick={() => setPinRevelado(null)}>
                            Listo
                          </button>
                        </div>
                        {pinRevelado.invitado === false && pinRevelado.errorInvitacion && (
                          <div className="pin-reveal warn">
                            <span className="pv-warn">Operador creado, pero la invitación por email falló: {pinRevelado.errorInvitacion}</span>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className={f.estado === "activo" ? "op-row" : "op-row inactive"} key={f.id}>
                      <div className="op-id">
                        <div className="op-av">{iniciales(f.nombre)}</div>
                        <div>
                          <div className="op-name">{f.nombre}</div>
                          <div className="op-legajo">{f.legajo ? `Legajo ${f.legajo}` : "Sin legajo"}</div>
                        </div>
                      </div>
                      <span className={f.rol === "admin" ? "role-pill admin" : "role-pill operador"}>{f.rol === "admin" ? "Admin" : "Operador"}</span>
                      <div className="scope-chips">
                        {f.alcanceTipo === "organizacion" ? (
                          <span className="scope-chip-sm org">Toda la organización</span>
                        ) : (
                          f.sitios.map((s) => (
                            <span className="scope-chip-sm" key={s.id}>
                              {s.nombre}
                            </span>
                          ))
                        )}
                      </div>
                      <span className={f.estado === "activo" ? "status-pill active" : "status-pill inactive"}>
                        {f.estado === "activo" ? "Activo" : "Dado de baja"}
                      </span>
                      <div className="row-actions">
                        {f.estado === "activo" && (
                          <button className="icon-btn" type="button" disabled={accionEnCursoId === f.id} onClick={() => void onResetearPin(f)}>
                            <svg viewBox="0 0 24 24">
                              <circle cx="8" cy="8" r="4" />
                              <path d="M10.8 10.8L20 20M15 15l3 3M18 12l3 3" />
                            </svg>
                            Resetear PIN
                          </button>
                        )}
                        <button className="icon-btn" type="button" onClick={() => abrirEdicion(f)}>
                          <svg viewBox="0 0 24 24">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                          Editar
                        </button>
                        {f.estado === "activo" ? (
                          <button className="icon-btn" type="button" onClick={() => setConfirmandoBajaId(f.id)}>
                            <svg viewBox="0 0 24 24">
                              <path d="M12 2v8" />
                              <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                            </svg>
                            Dar de baja
                          </button>
                        ) : (
                          <button className="icon-btn" type="button" disabled={accionEnCursoId === f.id} onClick={() => void reactivar(f)}>
                            <svg viewBox="0 0 24 24">
                              <path d="M12 2v8" />
                              <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                            </svg>
                            Reactivar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
      <footer className="wf-footer">
        <span>El PIN nunca se muestra salvo el instante en que se genera o se resetea — después queda hasheado, ni un admin puede volver a verlo.</span>
      </footer>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.editingId ? "Editar operador" : "Agregar operador"}
        footer={
          <>
            <button className="btn-ghost" type="button" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button className="btn-primary" type="button" disabled={guardando} onClick={() => void guardarDrawer()}>
              {guardando ? "Guardando…" : drawer?.editingId ? "Guardar cambios" : "Agregar operador"}
            </button>
          </>
        }
      >
        {drawer && (
          <>
            <div className="dfield">
              <label htmlFor="fNombre">Nombre</label>
              <input id="fNombre" type="text" value={drawer.nombre} placeholder="ej. R. Gimenez" onChange={(e) => setDrawer({ ...drawer, nombre: e.target.value })} />
            </div>
            <div className="dfield">
              <label htmlFor="fLegajo">Legajo (opcional)</label>
              <input id="fLegajo" type="text" value={drawer.legajo} placeholder="ej. 8842" onChange={(e) => setDrawer({ ...drawer, legajo: e.target.value })} />
            </div>
            <div className="dfield">
              <label>Rol</label>
              <div className="seg-toggle">
                <button type="button" className={drawer.rol === "operador" ? "on" : ""} onClick={() => setDrawer({ ...drawer, rol: "operador" })}>
                  Operador
                </button>
                <button type="button" className={drawer.rol === "admin" ? "on" : ""} onClick={() => setDrawer({ ...drawer, rol: "admin" })}>
                  Admin
                </button>
              </div>
              <div className="hint">Admin además puede loguearse en Frontend Web y administrar el padrón, los sitios y el calendario de simulacros desde acá.</div>
            </div>
            <div className="dfield">
              <label>Alcance</label>
              <div className="seg-toggle">
                <button type="button" className={drawer.alcanceTipo === "sitio" ? "on" : ""} onClick={() => setDrawer({ ...drawer, alcanceTipo: "sitio" })}>
                  Sitio(s) puntuales
                </button>
                <button type="button" className={drawer.alcanceTipo === "organizacion" ? "on" : ""} onClick={() => setDrawer({ ...drawer, alcanceTipo: "organizacion" })}>
                  Toda la organización
                </button>
              </div>
              {drawer.alcanceTipo === "sitio" && (
                <div className="site-checks" style={{ marginTop: "0.6rem" }}>
                  {sitiosOpciones.map((s) => (
                    <label className="site-check" key={s.id}>
                      <input
                        type="checkbox"
                        checked={drawer.sitiosIds.includes(s.id)}
                        onChange={(e) => {
                          const sitiosIds = e.target.checked ? [...drawer.sitiosIds, s.id] : drawer.sitiosIds.filter((id) => id !== s.id);
                          setDrawer({ ...drawer, sitiosIds });
                        }}
                      />
                      {s.nombre}
                    </label>
                  ))}
                </div>
              )}
              <div className="hint">Define en qué sitio(s) puede operar consolas y qué ve en Frontend Web.</div>
            </div>
            {!drawer.editingId && drawer.rol === "admin" && (
              <div className="dfield">
                <label htmlFor="fEmail">Email para login web (opcional)</label>
                <input id="fEmail" type="email" value={drawer.email} placeholder="ej. admin@empresa.com" onChange={(e) => setDrawer({ ...drawer, email: e.target.value })} />
                <div className="hint">Si lo completás, se le manda una invitación por email para que active su login de Frontend Web. Se puede completar después.</div>
              </div>
            )}
            {!drawer.editingId && (
              <div className="dfield">
                <label>PIN inicial</label>
                <input type="text" value="Se genera automáticamente al guardar" disabled style={{ opacity: 0.6 }} />
                <div className="hint">Se muestra una sola vez apenas se crea el operador — igual que al resetear un PIN existente.</div>
              </div>
            )}
          </>
        )}
      </Drawer>

      <Toast mensaje={mensaje} />
    </div>
  );
}
