// Ver Cowork "Administración de Padrón de Personas", pestaña "Padrón".
// Alta manual, edición, dar de baja/reactivar — escritura directa
// contra Supabase (ver lib/personas.ts). Solo personal FIJO: el
// eventual/contratista entra por código de acceso (pestaña "Códigos de
// acceso"), nunca desde acá — mismo criterio que documenta el
// wireframe.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { listarSitiosDeOrganizacion, type SitioOpcion } from "../lib/operadores";
import { listarPadron, crearPersonaManual, actualizarPersonaManual, cambiarEstadoPersona, type PersonaFila } from "../lib/personas";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import { PersonasTabs } from "../components/PersonasTabs";
import "./Padron.css";

interface FormularioDrawer {
  editingId: string | null;
  nombre: string;
  dni: string;
  legajo: string;
  telefono: string;
  sitioId: string;
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

export function Padron() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [filas, setFilas] = useState<PersonaFila[] | null>(null);
  const [sitios, setSitios] = useState<SitioOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "fijo" | "eventual">("todos");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activo" | "de_baja">("todos");
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FormularioDrawer | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [accionEnCursoId, setAccionEnCursoId] = useState<string | null>(null);

  async function cargar(organizacionId: string) {
    setError(null);
    try {
      const [padron, sitiosDeOrg] = await Promise.all([listarPadron(organizacionId), listarSitiosDeOrganizacion(organizacionId)]);
      setFilas(padron);
      setSitios(sitiosDeOrg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el padrón de personas.");
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
    return filas.filter((f) => {
      if (filtroTipo !== "todos" && f.tipo !== filtroTipo) return false;
      if (filtroEstado !== "todos" && f.estado !== filtroEstado) return false;
      if (!q) return true;
      return f.nombre.toLowerCase().includes(q) || f.dni.toLowerCase().includes(q) || (f.legajo ?? "").toLowerCase().includes(q);
    });
  }, [filas, busqueda, filtroTipo, filtroEstado]);

  if (!operador) return null;

  function abrirAlta() {
    setDrawer({ editingId: null, nombre: "", dni: "", legajo: "", telefono: "", sitioId: sitios[0]?.id ?? "" });
  }
  function abrirEdicion(f: PersonaFila) {
    setDrawer({ editingId: f.id, nombre: f.nombre, dni: f.dni, legajo: f.legajo ?? "", telefono: f.telefono, sitioId: f.sitioId });
  }

  async function guardarDrawer() {
    if (!drawer || !operador) return;
    const nombre = drawer.nombre.trim();
    const dni = drawer.dni.trim();
    const telefono = drawer.telefono.trim();
    if (!nombre) {
      mostrar("Falta el nombre.");
      return;
    }
    if (!dni) {
      mostrar("Falta el DNI.");
      return;
    }
    if (!telefono) {
      mostrar("Falta el teléfono.");
      return;
    }
    if (!drawer.sitioId) {
      mostrar("Elegí un sitio.");
      return;
    }
    setGuardando(true);
    try {
      const legajo = drawer.legajo.trim() || null;
      const resultado = drawer.editingId
        ? await actualizarPersonaManual(drawer.editingId, { nombre, dni, legajo, telefono, sitioId: drawer.sitioId })
        : await crearPersonaManual({ organizacionId: operador.organizacionId, sitioId: drawer.sitioId, nombre, dni, legajo, telefono });
      if (!resultado.ok) {
        mostrar(resultado.error);
        return;
      }
      const editando = drawer.editingId !== null;
      setDrawer(null);
      await cargar(operador.organizacionId);
      mostrar(editando ? "Cambios guardados." : `"${nombre}" agregado al padrón.`);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando los cambios.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarToggle(f: PersonaFila) {
    if (!operador) return;
    const nuevoEstado = f.estado === "activo" ? "de_baja" : "activo";
    setAccionEnCursoId(f.id);
    try {
      await cambiarEstadoPersona(f.id, nuevoEstado);
      setConfirmandoId(null);
      mostrar(`"${f.nombre}" ${nuevoEstado === "activo" ? "reactivado" : "dado de baja"}.`);
      await cargar(operador.organizacionId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado guardando el cambio.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  const activos = filas ? filas.filter((f) => f.estado === "activo").length : 0;
  const soloSms = filas ? filas.filter((f) => f.estado === "activo" && !f.tienePush).length : 0;

  return (
    <div className="app">
      <Topbar titulo="Padrón de Personas" />
      <main>
        <PersonasTabs count={filas?.length} />
        <div className="intro">
          <div className="eyebrow">Administración · a quién se le manda la alerta</div>
          <p>
            Todo el personal que tiene que <b>recibir</b> una alerta — no confundir con el padrón de Operadores, mucho más chico, que es
            quien puede <b>disparar</b> un evento desde una consola. El personal fijo entra por acá (alta manual o import masivo) o por
            autoregistro pendiente de aprobación; el eventual/contratista entra con un código de acceso que se autovalida solo.
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar el padrón: {error}</div>}
        {!error && filas === null && <div className="empty">Cargando padrón…</div>}

        {!error && filas !== null && (
          <>
            <div className="toolbar">
              <div className="tb-count">
                <b>{activos}</b> de {filas.length} activos · <b>{soloSms}</b> solo con cobertura SMS
              </div>
              <div className="toolbar-right">
                <input className="search" placeholder="Buscar por nombre, DNI o legajo…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                <select className="fselect" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}>
                  <option value="todos">Todos los tipos</option>
                  <option value="fijo">Fijo</option>
                  <option value="eventual">Eventual</option>
                </select>
                <select className="fselect" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}>
                  <option value="todos">Todos los estados</option>
                  <option value="activo">Activo</option>
                  <option value="de_baja">Dado de baja</option>
                </select>
                <button className="btn-primary" type="button" onClick={abrirAlta}>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Alta manual
                </button>
              </div>
            </div>

            {filtradas.length === 0 ? (
              <div className="empty">Sin resultados para esos filtros.</div>
            ) : (
              <div className="list">
                {filtradas.map((f) => {
                  if (confirmandoId === f.id) {
                    const activar = f.estado !== "activo";
                    return (
                      <div className="p-row" key={f.id}>
                        <div className="confirm-row">
                          <div className="cr-text">
                            ¿{activar ? "Reactivar a" : "Dar de baja a"} <b>{f.nombre}</b>?{" "}
                            {activar ? "Vuelve a estar habilitado para recibir alertas." : "Deja de recibir alertas de este sistema hasta que se lo reactive."}
                          </div>
                          <div className="cr-actions">
                            <button className="btn-ghost" type="button" onClick={() => setConfirmandoId(null)}>
                              Cancelar
                            </button>
                            <button
                              className={activar ? "btn-ok" : "btn-danger"}
                              type="button"
                              disabled={accionEnCursoId === f.id}
                              onClick={() => void confirmarToggle(f)}
                            >
                              {activar ? "Reactivar" : "Dar de baja"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const subLine =
                    f.tipo === "fijo"
                      ? `DNI ${f.dni}${f.legajo ? ` · Legajo ${f.legajo}` : ""}`
                      : `DNI ${f.dni}${f.empresa ? ` · ${f.empresa}` : ""}${f.vencimiento ? ` · vence ${f.vencimiento}` : ""}`;
                  const estCls = f.estado === "activo" ? "active" : f.estado === "vencido" ? "vencido" : "inactive";
                  const estLabel = f.estado === "activo" ? "Activo" : f.estado === "vencido" ? "Vencido" : "Dado de baja";
                  return (
                    <div className={f.estado === "activo" ? "p-row" : "p-row inactive"} key={f.id}>
                      <div className="p-id">
                        <div className="p-av">{iniciales(f.nombre)}</div>
                        <div>
                          <div className="p-name">{f.nombre}</div>
                          <div className="p-sub">{subLine}</div>
                        </div>
                      </div>
                      <span className={f.tipo === "fijo" ? "tipo-pill fijo" : "tipo-pill eventual"}>{f.tipo === "fijo" ? "Fijo" : "Eventual"}</span>
                      <div className="site-chip-sm">{f.sitioNombre}</div>
                      <span className="cov-pill">
                        {f.tienePush ? (
                          <svg viewBox="0 0 24 24">
                            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        )}
                        {f.tienePush ? "Push + SMS" : "Solo SMS"}
                      </span>
                      <span className={`status-pill ${estCls}`}>{estLabel}</span>
                      <div className="row-actions">
                        <button className="icon-btn" type="button" onClick={() => abrirEdicion(f)}>
                          <svg viewBox="0 0 24 24">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                          Editar
                        </button>
                        {(f.estado === "activo" || f.estado === "de_baja") && (
                          <button
                            className={f.estado === "activo" ? "icon-btn bad" : "icon-btn good"}
                            type="button"
                            onClick={() => setConfirmandoId(f.id)}
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M12 2v8" />
                              <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                            </svg>
                            {f.estado === "activo" ? "Dar de baja" : "Reactivar"}
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
        <span>El SMS funciona desde el alta porque el teléfono ya está en el padrón — el push necesita que la persona además abra la app una vez.</span>
      </footer>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.editingId ? "Editar persona" : "Alta manual"}
        footer={
          <>
            <button className="btn-ghost" type="button" onClick={() => setDrawer(null)}>
              Cancelar
            </button>
            <button className="btn-primary" type="button" disabled={guardando} onClick={() => void guardarDrawer()}>
              {guardando ? "Guardando…" : drawer?.editingId ? "Guardar cambios" : "Agregar a la vez"}
            </button>
          </>
        }
      >
        {drawer && (
          <>
            <div className="dfield">
              <label htmlFor="fNombre">Nombre</label>
              <input id="fNombre" type="text" value={drawer.nombre} placeholder="ej. Carlos Medina" onChange={(e) => setDrawer({ ...drawer, nombre: e.target.value })} />
            </div>
            <div className="dfield">
              <label htmlFor="fDni">DNI</label>
              <input id="fDni" type="text" value={drawer.dni} placeholder="ej. 28.441.902" onChange={(e) => setDrawer({ ...drawer, dni: e.target.value })} />
            </div>
            <div className="dfield">
              <label htmlFor="fLegajo">Legajo (si tiene)</label>
              <input
                id="fLegajo"
                type="text"
                value={drawer.legajo}
                placeholder="Solo personal fijo con legajo propio"
                onChange={(e) => setDrawer({ ...drawer, legajo: e.target.value })}
              />
            </div>
            <div className="dfield">
              <label htmlFor="fTelefono">Teléfono</label>
              <input
                id="fTelefono"
                type="text"
                value={drawer.telefono}
                placeholder="+54 9 291 400-0000"
                onChange={(e) => setDrawer({ ...drawer, telefono: e.target.value })}
              />
            </div>
            <div className="dfield">
              <label htmlFor="fSitio">Sitio</label>
              <select id="fSitio" value={drawer.sitioId} onChange={(e) => setDrawer({ ...drawer, sitioId: e.target.value })}>
                {sitios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            {!drawer.editingId && (
              <div className="import-note">
                Para una incorporación puntual que no puede esperar al próximo import. El SMS funciona apenas se guarda; el push necesita que
                la persona además abra la app y haga el login liviano (legajo/DNI).
              </div>
            )}
          </>
        )}
      </Drawer>

      <Toast mensaje={mensaje} />
    </div>
  );
}
