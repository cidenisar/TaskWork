// Ver Cowork "Administración de Padrón de Personas" (pestaña "Códigos
// de acceso") y backend-server/README.md ("Autoregistro de personas
// (Mobile)") — un código generado acá es lo que alguien ingresa en
// Mobile (`POST /personas/canjear-codigo`, ya construido y validado
// hace tiempo) para autoregistrarse al instante, sin pasar por
// aprobación.

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listarSitiosDeOrganizacion, type SitioOpcion } from "../lib/operadores";
import { listarCodigos, crearCodigo, revocarCodigo, type CodigoAcceso, type TipoCodigo } from "../lib/codigos";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import "./Codigos.css";

interface FormularioDrawer {
  tipo: TipoCodigo;
  dni: string;
  empresa: string;
  sitioId: string;
  vencimiento: string;
  topeUsos: string;
}

function estadoLabel(estado: CodigoAcceso["estado"]): string {
  return { vigente: "Vigente", vencido: "Vencido", agotado: "Agotado", revocado: "Revocado" }[estado];
}

export function Codigos() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [filas, setFilas] = useState<CodigoAcceso[] | null>(null);
  const [sitiosOpciones, setSitiosOpciones] = useState<SitioOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmandoRevocarId, setConfirmandoRevocarId] = useState<string | null>(null);
  const [accionEnCursoId, setAccionEnCursoId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FormularioDrawer | null>(null);
  const [codigoRevelado, setCodigoRevelado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar(organizacionId: string) {
    setError(null);
    try {
      const [codigos, sitios] = await Promise.all([listarCodigos(organizacionId), listarSitiosDeOrganizacion(organizacionId)]);
      setFilas(codigos);
      setSitiosOpciones(sitios);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los códigos de acceso.");
    }
  }

  useEffect(() => {
    if (!operador) return;
    void cargar(operador.organizacionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  if (!operador) return null;

  function abrirDrawer(tipo: TipoCodigo) {
    setCodigoRevelado(null);
    setDrawer({ tipo, dni: "", empresa: "", sitioId: sitiosOpciones[0]?.id ?? "", vencimiento: "", topeUsos: "10" });
  }
  function cerrarDrawer() {
    setDrawer(null);
    setCodigoRevelado(null);
  }

  async function guardarDrawer() {
    if (!drawer || !operador) return;
    const empresa = drawer.empresa.trim();
    if (!empresa) {
      mostrar("Falta la empresa contratista.");
      return;
    }
    if (!drawer.sitioId) {
      mostrar("Falta el sitio.");
      return;
    }
    if (!drawer.vencimiento) {
      mostrar("Falta la fecha de vencimiento.");
      return;
    }
    const dni = drawer.dni.trim();
    if (drawer.tipo === "individual" && !dni) {
      mostrar("Falta el DNI de la persona.");
      return;
    }
    const topeUsos = Math.floor(Number(drawer.topeUsos));
    if (drawer.tipo === "lote" && (!Number.isFinite(topeUsos) || topeUsos < 1)) {
      mostrar("La cantidad de usos tiene que ser un número mayor a 0.");
      return;
    }

    setGuardando(true);
    try {
      const resultado = await crearCodigo(operador.organizacionId, operador.id, {
        tipo: drawer.tipo,
        dni: drawer.tipo === "individual" ? dni : null,
        empresa,
        sitioId: drawer.sitioId,
        vencimiento: drawer.vencimiento,
        topeUsos,
      });
      setCodigoRevelado(resultado.codigo);
      await cargar(operador.organizacionId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado generando el código.");
    } finally {
      setGuardando(false);
    }
  }

  async function onRevocar(c: CodigoAcceso) {
    if (!operador) return;
    setAccionEnCursoId(c.id);
    try {
      await revocarCodigo(c.id);
      setConfirmandoRevocarId(null);
      mostrar(`Código "${c.codigo}" revocado.`);
      await cargar(operador.organizacionId);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado revocando el código.");
    } finally {
      setAccionEnCursoId(null);
    }
  }

  const vigentes = filas ? filas.filter((c) => c.estado === "vigente").length : 0;

  return (
    <div className="app">
      <Topbar titulo="Códigos de acceso" />
      <main>
        <div className="intro">
          <div className="eyebrow">Administración · autoregistro de personal eventual</div>
          <p>
            Cada código lleva embebidos la empresa, el sitio y el vencimiento que definas acá — la persona lo ingresa en Mobile y el alta
            queda activa al instante, sin que nadie tenga que aprobarla en ese momento.
          </p>
        </div>

        {error && <div className="empty">No se pudo cargar: {error}</div>}
        {!error && filas === null && <div className="empty">Cargando…</div>}

        {!error && filas !== null && (
          <>
            <div className="toolbar">
              <div className="tb-count">
                <b>{vigentes}</b> de {filas.length} vigentes
              </div>
              <div className="toolbar-right">
                <button className="btn-secondary" type="button" onClick={() => abrirDrawer("individual")}>
                  <svg viewBox="0 0 24 24">
                    <circle cx="8" cy="8" r="4" />
                    <path d="M10.8 10.8L20 20M15 15l3 3M18 12l3 3" />
                  </svg>
                  Código individual
                </button>
                <button className="btn-primary" type="button" onClick={() => abrirDrawer("lote")}>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Código por lote/cuadrilla
                </button>
              </div>
            </div>

            {filas.length === 0 ? (
              <div className="empty">Todavía no generaste ningún código.</div>
            ) : (
              <div className="list">
                {filas.map((c) => {
                  if (confirmandoRevocarId === c.id) {
                    return (
                      <div className="code-row" key={c.id}>
                        <div className="confirm-row">
                          <div className="cr-text">
                            ¿Revocar el código <b>{c.codigo}</b>? Deja de poder usarse de inmediato, aunque le queden usos disponibles.
                          </div>
                          <div className="cr-actions">
                            <button className="btn-ghost" type="button" onClick={() => setConfirmandoRevocarId(null)}>
                              Cancelar
                            </button>
                            <button className="btn-danger" type="button" disabled={accionEnCursoId === c.id} onClick={() => void onRevocar(c)}>
                              Revocar
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className={c.estado !== "vigente" ? "code-row dim" : "code-row"} key={c.id}>
                      <div className="code-val">{c.codigo}</div>
                      <span className={c.tipo === "individual" ? "tipo-pill individual" : "tipo-pill lote"}>{c.tipo === "individual" ? "Individual" : "Lote"}</span>
                      <div className="code-meta">
                        <b>{c.empresa}</b> · {c.sitioNombre}
                        {c.dni ? ` · DNI ${c.dni}` : ""} · vence {c.vencimiento}
                      </div>
                      <div className="code-use">{c.tipo === "individual" ? (c.usosActuales >= c.topeUsos ? "Usado" : "Sin usar") : `${c.usosActuales} / ${c.topeUsos}`}</div>
                      <span className={`status-pill ${c.estado}`}>{estadoLabel(c.estado)}</span>
                      {c.estado === "vigente" && (
                        <div className="row-actions">
                          <button className="icon-btn bad" type="button" onClick={() => setConfirmandoRevocarId(c.id)}>
                            <svg viewBox="0 0 24 24">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                            Revocar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <Drawer
        open={drawer !== null}
        onClose={cerrarDrawer}
        title={codigoRevelado ? "Código generado" : drawer?.tipo === "individual" ? "Código individual" : "Código por lote / cuadrilla"}
        footer={
          codigoRevelado ? (
            <button className="btn-primary" type="button" style={{ flex: 1, justifyContent: "center" }} onClick={cerrarDrawer}>
              Listo
            </button>
          ) : (
            <>
              <button className="btn-ghost" type="button" onClick={cerrarDrawer}>
                Cancelar
              </button>
              <button className="btn-primary" type="button" disabled={guardando} onClick={() => void guardarDrawer()}>
                {guardando ? "Generando…" : "Generar código"}
              </button>
            </>
          )
        }
      >
        {drawer && codigoRevelado && (
          <div className="code-reveal">
            <span className="cv">{codigoRevelado}</span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
              Compartilo con {drawer.tipo === "individual" ? "la persona" : "el responsable de la cuadrilla"} — lo ingresa en Mobile al
              llegar y el alta queda activa al instante.
            </span>
          </div>
        )}
        {drawer && !codigoRevelado && (
          <>
            <div className="seg-toggle">
              <button type="button" className={drawer.tipo === "individual" ? "on" : ""} onClick={() => setDrawer({ ...drawer, tipo: "individual" })}>
                Individual
              </button>
              <button type="button" className={drawer.tipo === "lote" ? "on" : ""} onClick={() => setDrawer({ ...drawer, tipo: "lote" })}>
                Lote / cuadrilla
              </button>
            </div>
            {drawer.tipo === "individual" ? (
              <div className="dfield">
                <label htmlFor="fDni">DNI de la persona</label>
                <input id="fDni" type="text" value={drawer.dni} placeholder="ej. 40.112.765" onChange={(e) => setDrawer({ ...drawer, dni: e.target.value })} />
              </div>
            ) : (
              <div className="dfield">
                <label htmlFor="fTope">Cantidad de usos (tope)</label>
                <input id="fTope" type="number" min={1} value={drawer.topeUsos} onChange={(e) => setDrawer({ ...drawer, topeUsos: e.target.value })} />
                <div className="hint">Un único código, compartido, válido hasta agotar este tope o vencer.</div>
              </div>
            )}
            <div className="dfield">
              <label htmlFor="fEmpresa">Empresa contratista</label>
              <input id="fEmpresa" type="text" value={drawer.empresa} placeholder="ej. Andina Andamios SRL" onChange={(e) => setDrawer({ ...drawer, empresa: e.target.value })} />
            </div>
            <div className="dfield">
              <label htmlFor="fSitio">Sitio</label>
              <select id="fSitio" value={drawer.sitioId} onChange={(e) => setDrawer({ ...drawer, sitioId: e.target.value })}>
                {sitiosOpciones.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="dfield">
              <label htmlFor="fVencimiento">Vencimiento</label>
              <input id="fVencimiento" type="date" value={drawer.vencimiento} onChange={(e) => setDrawer({ ...drawer, vencimiento: e.target.value })} />
              <div className="hint">Al llegar la fecha, el código pasa a "Vencido" solo — nadie tiene que acordarse.</div>
            </div>
          </>
        )}
      </Drawer>

      <Toast mensaje={mensaje} />
    </div>
  );
}
