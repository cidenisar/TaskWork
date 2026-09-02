// Ver Cowork "Administración de Padrón de Personas", pestaña
// "Importar". Desvío deliberado del wireframe (ver lib/importarPadron.ts
// para el porqué): acá se sube un CSV real (no .xlsx) y se lo parsea/
// diffea de verdad contra el padrón real. Las "posibles bajas" nunca se
// aplican solas — quedan en esta misma pantalla, cada una con su propio
// botón de "Dar de baja", hasta que un admin decide cada una a mano.

import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { listarSitiosDeOrganizacion, type SitioOpcion } from "../lib/operadores";
import { listarPadron, cambiarEstadoPersona, aplicarImport, type PersonaFila, type ResultadoAplicarImport } from "../lib/personas";
import { parsearCsvPadron, calcularDiffImport, type DiffImport } from "../lib/importarPadron";
import { useToast } from "../lib/useToast";
import { Topbar } from "../components/Topbar";
import { Toast } from "../components/Toast";
import { PersonasTabs } from "../components/PersonasTabs";
import "./Importar.css";

type Fase = "idle" | "preview" | "resultado";

export function Importar() {
  const { operador } = useAuth();
  const { mensaje, mostrar } = useToast();

  const [padron, setPadron] = useState<PersonaFila[] | null>(null);
  const [sitios, setSitios] = useState<SitioOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [fase, setFase] = useState<Fase>("idle");
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffImport | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultadoAplicar, setResultadoAplicar] = useState<ResultadoAplicarImport | null>(null);
  const [posiblesBajas, setPosiblesBajas] = useState<PersonaFila[]>([]);
  const [bajaEnCursoId, setBajaEnCursoId] = useState<string | null>(null);

  useEffect(() => {
    if (!operador) return;
    (async () => {
      setError(null);
      try {
        const [p, s] = await Promise.all([listarPadron(operador.organizacionId), listarSitiosDeOrganizacion(operador.organizacionId)]);
        setPadron(p);
        setSitios(s);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el padrón para comparar contra el archivo.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operador?.organizacionId]);

  if (!operador) return null;

  function onArchivoElegido(file: File) {
    setErrorArchivo(null);
    const nombreLower = file.name.toLowerCase();
    if (nombreLower.endsWith(".xlsx") || nombreLower.endsWith(".xls")) {
      setErrorArchivo('Este import solo lee CSV, no el binario de Excel. Desde la planilla: "Guardar como…" → CSV (UTF-8), y subí ese archivo.');
      return;
    }
    if (!padron) return;
    const reader = new FileReader();
    reader.onload = () => {
      const texto = typeof reader.result === "string" ? reader.result : "";
      const parseo = parsearCsvPadron(texto);
      if ("error" in parseo) {
        setErrorArchivo(parseo.error);
        return;
      }
      const d = calcularDiffImport(parseo.filas, padron, sitios);
      setDiff(d);
      setPosiblesBajas(d.posiblesBajas);
      setFase("preview");
      if (parseo.errores.length > 0) {
        mostrar(`${parseo.errores.length} fila(s) del archivo se saltearon por datos incompletos.`);
      }
    };
    reader.onerror = () => setErrorArchivo("No se pudo leer el archivo.");
    reader.readAsText(file, "utf-8");
  }

  function cancelarPreview() {
    setFase("idle");
    setDiff(null);
    setErrorArchivo(null);
  }

  async function confirmarImport() {
    if (!diff || !operador) return;
    setAplicando(true);
    try {
      const resultado = await aplicarImport(operador.organizacionId, diff.altas, diff.cambios);
      setResultadoAplicar(resultado);
      setFase("resultado");
      const partes: string[] = [];
      if (resultado.altasOk > 0) partes.push(`${resultado.altasOk} alta(s)`);
      if (resultado.cambiosOk > 0) partes.push(`${resultado.cambiosOk} cambio(s)`);
      if (partes.length === 0) partes.push("Sin altas ni cambios para aplicar");
      const errores = resultado.altasError.length + resultado.cambiosError.length;
      mostrar(`${partes.join(" y ")} aplicados${errores > 0 ? ` — ${errores} fila(s) con error, ver detalle` : "."}`);
      const p = await listarPadron(operador.organizacionId);
      setPadron(p);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado aplicando el import.");
    } finally {
      setAplicando(false);
    }
  }

  async function darDeBaja(p: PersonaFila) {
    setBajaEnCursoId(p.id);
    try {
      await cambiarEstadoPersona(p.id, "de_baja");
      setPosiblesBajas((prev) => prev.filter((x) => x.id !== p.id));
      mostrar(`"${p.nombre}" dado de baja.`);
    } catch (err) {
      mostrar(err instanceof Error ? err.message : "Error inesperado dando de baja.");
    } finally {
      setBajaEnCursoId(null);
    }
  }

  function volverAlInicio() {
    setFase("idle");
    setDiff(null);
    setResultadoAplicar(null);
    setErrorArchivo(null);
  }

  return (
    <div className="app">
      <Topbar titulo="Padrón de Personas" />
      <main>
        <PersonasTabs />
        <div className="intro">
          <div className="eyebrow">Administración · alta y actualización masiva de personal fijo</div>
          <p>
            El import es un <b>upsert por DNI</b>: agrega altas nuevas y actualiza teléfono/legajo/sitio de quien ya está. Nadie se da de
            baja automáticamente — quien no aparece en el archivo queda listado abajo como posible baja para que lo confirmes vos, uno por
            uno.
          </p>
        </div>

        {error && <div className="empty">{error}</div>}

        {!error && fase === "idle" && (
          <>
            <label className="import-card" htmlFor="fileInput">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4M7 9l5-5 5 5" />
                <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
              <div className="ic-title">Subir archivo de padrón (CSV)</div>
              <div className="ic-sub">
                Columnas: <code>nombre, dni, legajo, telefono, sitio</code> (legajo es opcional; el resto no) — el nombre del sitio tiene que
                coincidir con uno ya existente. Separador coma o punto y coma, con o sin comillas.
              </div>
              <span className="btn-primary">
                <svg viewBox="0 0 24 24">
                  <path d="M12 16V4M7 9l5-5 5 5" />
                  <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
                Elegir archivo…
              </span>
            </label>
            <input
              id="fileInput"
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onArchivoElegido(file);
                e.target.value = "";
              }}
            />
            {errorArchivo && <div className="import-note error">{errorArchivo}</div>}
          </>
        )}

        {fase === "preview" && diff && (
          <div className="import-summary">
            <div className="stat-tiles">
              <div className="stat-tile alta">
                <div className="st-num">{diff.altas.length}</div>
                <div className="st-label">Altas nuevas</div>
              </div>
              <div className="stat-tile cambio">
                <div className="st-num">{diff.cambios.length}</div>
                <div className="st-label">Cambios</div>
              </div>
              <div className="stat-tile baja">
                <div className="st-num">{diff.posiblesBajas.length}</div>
                <div className="st-label">Posibles bajas</div>
              </div>
            </div>

            {diff.altas.length + diff.cambios.length === 0 ? (
              <div className="empty">Nada para aplicar — el archivo no trae altas ni cambios respecto del padrón actual.</div>
            ) : (
              <div className="preview-table">
                {diff.altas.map((a) => (
                  <div className="pt-row" key={`alta-${a.dni}`}>
                    <span className="pt-tag alta">+</span>
                    <span className="pt-name">{a.nombre}</span>
                    <span className="pt-detail">nuevo — {a.sitioNombre}</span>
                  </div>
                ))}
                {diff.cambios.map((c) => (
                  <div className="pt-row" key={`cambio-${c.personaId}`}>
                    <span className="pt-tag cambio">~</span>
                    <span className="pt-name">{c.nombre}</span>
                    <span className="pt-detail">{c.detalle.join(", ")}</span>
                  </div>
                ))}
              </div>
            )}

            {(diff.erroresSitio.length > 0 || diff.conflictos.length > 0) && (
              <div className="import-note error">
                {diff.erroresSitio.length > 0 && (
                  <div>
                    {diff.erroresSitio.length} fila(s) con un sitio que no existe:{" "}
                    {diff.erroresSitio.map((e) => `línea ${e.linea} (${e.nombre}, "${e.sitioNombre}")`).join("; ")}.
                  </div>
                )}
                {diff.conflictos.length > 0 && (
                  <div>
                    {diff.conflictos.map((c) => (
                      <div key={c.linea}>
                        Línea {c.linea} ({c.nombre}): {c.motivo}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="import-note">Las posibles bajas no se aplican solas — quedan abajo para que confirmes cada una a mano, no se borran ni desactivan automáticamente acá.</div>

            <div className="import-actions">
              <button className="btn-ghost" type="button" onClick={cancelarPreview}>
                Cancelar
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={aplicando || diff.altas.length + diff.cambios.length === 0}
                onClick={() => void confirmarImport()}
              >
                {aplicando ? "Aplicando…" : "Confirmar import"}
              </button>
            </div>
          </div>
        )}

        {fase === "resultado" && resultadoAplicar && (
          <div className="import-summary">
            <div className="stat-tiles">
              <div className="stat-tile alta">
                <div className="st-num">{resultadoAplicar.altasOk}</div>
                <div className="st-label">Altas aplicadas</div>
              </div>
              <div className="stat-tile cambio">
                <div className="st-num">{resultadoAplicar.cambiosOk}</div>
                <div className="st-label">Cambios aplicados</div>
              </div>
              <div className="stat-tile baja">
                <div className="st-num">{posiblesBajas.length}</div>
                <div className="st-label">Posibles bajas sin resolver</div>
              </div>
            </div>

            {(resultadoAplicar.altasError.length > 0 || resultadoAplicar.cambiosError.length > 0) && (
              <div className="import-note error">
                {resultadoAplicar.altasError.map((e, i) => (
                  <div key={`ae-${i}`}>
                    No se pudo dar de alta a {e.nombre} (DNI {e.dni}): {e.error}
                  </div>
                ))}
                {resultadoAplicar.cambiosError.map((e, i) => (
                  <div key={`ce-${i}`}>
                    No se pudo actualizar a {e.nombre}: {e.error}
                  </div>
                ))}
              </div>
            )}

            {posiblesBajas.length === 0 ? (
              <div className="empty">No hay posibles bajas pendientes de este import.</div>
            ) : (
              <div className="list">
                {posiblesBajas.map((p) => (
                  <div className="pt-row baja-row" key={p.id}>
                    <span className="pt-tag baja">✕</span>
                    <span className="pt-name">{p.nombre}</span>
                    <span className="pt-detail">no apareció en este import — DNI {p.dni} · {p.sitioNombre}</span>
                    <button className="icon-btn bad" type="button" disabled={bajaEnCursoId === p.id} onClick={() => void darDeBaja(p)}>
                      <svg viewBox="0 0 24 24">
                        <path d="M12 2v8" />
                        <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
                      </svg>
                      Dar de baja
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="import-actions">
              <button className="btn-primary" type="button" onClick={volverAlInicio}>
                Importar otro archivo
              </button>
            </div>
          </div>
        )}
      </main>
      <footer className="wf-footer">
        <span>El import es solo para personal fijo — el eventual/contratista entra por código de acceso, no por acá.</span>
      </footer>
      <Toast mensaje={mensaje} />
    </div>
  );
}
