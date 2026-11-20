"use client";

import { useMemo, useState } from "react";
import { crearEvaluacionRiesgoViajeAction } from "@/app/(app)/riesgo-viaje/nueva/actions";
import { actualizarEstadoViajeAction } from "@/app/(app)/riesgo-viaje/actions";
import { linkWhatsappGrupo, linkWhatsappIndividual } from "@/lib/guardia/whatsapp";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { RiesgoBadge } from "./badges";
import { RutaMapa } from "./ruta-mapa";
import { CRITERIOS_RIESGO_VIAJE, DISTANCIA_SUGIERE_PUNTO_MEDIO, type CriterioKey } from "@/lib/riesgo-viaje/criterios";
import type { NivelRiesgoViaje } from "@/lib/database.types";

export interface VehiculoOpcion {
  id: string;
  patente: string;
  marcaModelo: string | null;
}

/** `datetime-local` quiere "YYYY-MM-DDTHH:mm" en hora local, sin zona. */
function ahoraParaInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const CRITERIO_KEYS = Object.keys(CRITERIOS_RIESGO_VIAJE) as CriterioKey[];

function valorInicial(): Record<CriterioKey, string> {
  return CRITERIO_KEYS.reduce((acc, key) => ({ ...acc, [key]: "" }), {} as Record<CriterioKey, string>);
}

export function NuevaEvaluacionRiesgoViajeForm({
  vehiculos,
  tecnicos,
  empresaDefault,
}: {
  vehiculos: VehiculoOpcion[];
  tecnicos: string[];
  empresaDefault: string;
}) {
  const [vehiculoId, setVehiculoId] = useState("");
  const [conductorNombre, setConductorNombre] = useState("");
  const [acompananteInput, setAcompananteInput] = useState("");
  const [acompanantes, setAcompanantes] = useState<string[]>([]);
  const [empresa, setEmpresa] = useState(empresaDefault);
  const [fechaHora, setFechaHora] = useState(ahoraParaInput);
  const [origen, setOrigen] = useState("");
  const [destino, setDestino] = useState("");
  const [puntoMedio, setPuntoMedio] = useState("");
  const [criterios, setCriterios] = useState<Record<CriterioKey, string>>(valorInicial);

  const [submitting, setSubmitting] = useState(false);
  const [iniciando, setIniciando] = useState(false);
  const [autocompletando, setAutocompletando] = useState(false);
  const [avisosAutocompletar, setAvisosAutocompletar] = useState<string[]>([]);
  const [climaDescripcion, setClimaDescripcion] = useState<string | null>(null);
  const [rutaPreview, setRutaPreview] = useState<{
    distanciaKm: number;
    origen: { lat: number; lon: number };
    destino: { lat: number; lon: number };
    geometria: [number, number][];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ evaluacionId: string; total: number; nivel: NivelRiesgoViaje; mensaje: string } | null>(null);
  const [viajeIniciado, setViajeIniciado] = useState(false);

  const sugierePuntoMedio = Number(criterios.distancia) === DISTANCIA_SUGIERE_PUNTO_MEDIO;

  const totalPreview = useMemo(() => {
    if (CRITERIO_KEYS.some((k) => criterios[k] === "")) return null;
    return CRITERIO_KEYS.reduce((acc, k) => acc + Number(criterios[k]), 0);
  }, [criterios]);

  function addAcompanante() {
    const nombre = acompananteInput.trim();
    if (!nombre || acompanantes.includes(nombre)) return;
    setAcompanantes([...acompanantes, nombre]);
    setAcompananteInput("");
  }
  function removeAcompanante(i: number) {
    setAcompanantes(acompanantes.filter((_, idx) => idx !== i));
  }

  async function autocompletarConRuta() {
    if (!origen.trim() || !destino.trim()) return;
    setAutocompletando(true);
    setAvisosAutocompletar([]);
    setError(null);
    try {
      const res = await fetch("/api/riesgo-viaje/autocompletar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origen: origen.trim(), destino: destino.trim(), fechaHora, totalPersonas: 1 + acompanantes.length }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAvisosAutocompletar([data.error || "No se pudo completar con datos de la ruta."]);
        return;
      }
      setCriterios((prev) => ({
        ...prev,
        distancia: data.criterioDistancia != null ? String(data.criterioDistancia) : prev.distancia,
        tiempoViaje: data.criterioTiempoViaje != null ? String(data.criterioTiempoViaje) : prev.tiempoViaje,
        clima: data.criterioClima != null ? String(data.criterioClima) : prev.clima,
        personasPorVehiculo: data.criterioPersonasVehiculo != null ? String(data.criterioPersonasVehiculo) : prev.personasPorVehiculo,
      }));
      setAvisosAutocompletar(data.avisos ?? []);
      setClimaDescripcion(data.climaDescripcion ?? null);
      setRutaPreview(
        data.distanciaKm != null && data.origenCoords && data.destinoCoords
          ? { distanciaKm: data.distanciaKm, origen: data.origenCoords, destino: data.destinoCoords, geometria: data.geometria ?? [] }
          : null,
      );
    } catch {
      setAvisosAutocompletar(["No se pudo contactar el servicio de ruta — completá los criterios a mano."]);
    } finally {
      setAutocompletando(false);
    }
  }

  async function guardar() {
    setError(null);
    if (!vehiculoId) return setError("Elegí el vehículo.");
    if (!conductorNombre.trim()) return setError("Falta el conductor.");
    if (!origen.trim()) return setError("Falta el origen.");
    if (!destino.trim()) return setError("Falta el destino.");
    if (!fechaHora) return setError("Falta la fecha y hora del viaje.");
    for (const key of CRITERIO_KEYS) {
      if (criterios[key] === "") return setError(`Falta elegir una opción para "${CRITERIOS_RIESGO_VIAJE[key].label}".`);
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("vehiculoId", vehiculoId);
      fd.append("conductorNombre", conductorNombre.trim());
      for (const a of acompanantes) fd.append("acompanantes", a);
      fd.append("empresa", empresa.trim());
      fd.append("fechaHora", fechaHora);
      fd.append("origen", origen.trim());
      fd.append("destino", destino.trim());
      if (puntoMedio.trim()) fd.append("puntoMedio", puntoMedio.trim());
      for (const key of CRITERIO_KEYS) fd.append(key, criterios[key]);

      const res = await crearEvaluacionRiesgoViajeAction(fd);
      if (!res.success || !res.evaluacionId || res.total == null || !res.nivel || !res.mensaje) {
        const mensaje = res.error || "No se pudo guardar la evaluación.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "crear-evaluacion-riesgo-viaje");
        return;
      }
      setResultado({ evaluacionId: res.evaluacionId, total: res.total, nivel: res.nivel, mensaje: res.mensaje });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado guardando la evaluación.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "crear-evaluacion-riesgo-viaje", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  async function iniciarViaje() {
    if (!resultado) return;
    setIniciando(true);
    setError(null);
    try {
      const res = await actualizarEstadoViajeAction(resultado.evaluacionId, "iniciar");
      if (!res.success) {
        setError(res.error || "No se pudo iniciar el viaje.");
        return;
      }
      setViajeIniciado(true);
      // Además del push a la guardia general (ya lo dispara la acción), se ofrece avisar por WhatsApp — el link lo abre quien dispara el aviso.
      if (res.avisoWhatsapp) {
        const { telefono, texto } = res.avisoWhatsapp;
        window.open(telefono ? linkWhatsappIndividual(telefono, texto) : linkWhatsappGrupo(texto), "_blank");
      }
    } finally {
      setIniciando(false);
    }
  }

  function empezarOtra() {
    setVehiculoId("");
    setConductorNombre("");
    setAcompanantes([]);
    setAcompananteInput("");
    setEmpresa(empresaDefault);
    setFechaHora(ahoraParaInput());
    setOrigen("");
    setDestino("");
    setPuntoMedio("");
    setCriterios(valorInicial());
    setAvisosAutocompletar([]);
    setRutaPreview(null);
    setClimaDescripcion(null);
    setResultado(null);
    setViajeIniciado(false);
  }

  if (resultado) {
    return (
      <div>
        <div className="page-heading">
          <h1>Evaluación guardada</h1>
          <p>Resultado de la Evaluación de Riesgo del Viaje — se generó el PDF y se envió por mail.</p>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 10 }}>
            <RiesgoBadge nivel={resultado.nivel} total={resultado.total} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{resultado.mensaje}</div>
          <div className="hint">{origen} → {destino}</div>
        </div>

        {!viajeIniciado ? (
          <div className="card">
            <div className="section-label">¿Ya salen de viaje?</div>
            <p className="hint" style={{ marginBottom: 10 }}>
              Marcá &quot;Iniciar viaje&quot; recién cuando salgan — vas a poder marcar el punto medio (si aplica) y la llegada después, desde
              Historial.
            </p>
            <button type="button" className="btn btn-primary" onClick={iniciarViaje} disabled={iniciando}>
              {iniciando ? "Iniciando..." : "Iniciar viaje ahora"}
            </button>
          </div>
        ) : (
          <SuccessNote>Viaje iniciado. Marcá el punto medio y la llegada desde Historial cuando corresponda.</SuccessNote>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-secondary" onClick={empezarOtra}>
            + Cargar otra evaluación
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Evaluación de Riesgo del Viaje</h1>
        <p>Completá los 8 criterios antes de salir de viaje — el resultado no bloquea nada, es para tomar la decisión con información.</p>
      </div>

      <div className="card">
        <div className="field">
          <label>
            Vehículo <span className="req">*</span>
          </label>
          <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} disabled={submitting}>
            <option value="">Seleccionar vehículo...</option>
            {vehiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.patente} {v.marcaModelo ? `— ${v.marcaModelo}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>
            Conductor <span className="req">*</span>
          </label>
          <AutocompleteInput value={conductorNombre} onChange={setConductorNombre} suggestions={tecnicos} placeholder="Nombre completo" />
        </div>

        <div className="field">
          <label>
            Acompañantes <span className="opt">(opcional)</span>
          </label>
          <div className="grid2">
            <AutocompleteInput value={acompananteInput} onChange={setAcompananteInput} suggestions={tecnicos} placeholder="Nombre completo" />
            <button type="button" className="btn btn-secondary" onClick={addAcompanante}>
              + Agregar
            </button>
          </div>
          {acompanantes.length > 0 && (
            <div className="item-list">
              {acompanantes.map((a, i) => (
                <div className="list-item" key={`${a}-${i}`}>
                  <div className="info">
                    <div className="avatar">{(a[0] || "?").toUpperCase()}</div>
                    <div className="item-name">{a}</div>
                  </div>
                  <button type="button" className="remove-btn" onClick={() => removeAcompanante(i)}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid2">
          <div className="field">
            <label>
              Origen <span className="req">*</span>
            </label>
            <input type="text" placeholder="Ej: Mendoza" value={origen} onChange={(e) => setOrigen(e.target.value)} disabled={submitting} />
          </div>
          <div className="field">
            <label>
              Destino <span className="req">*</span>
            </label>
            <input type="text" placeholder="Ej: Malargüe" value={destino} onChange={(e) => setDestino(e.target.value)} disabled={submitting} />
          </div>
        </div>

        <div className="field">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={autocompletarConRuta}
            disabled={!origen.trim() || !destino.trim() || autocompletando || submitting}
          >
            <Icon name="map" size={13} /> {autocompletando ? "Completando..." : "Autocompletar con la ruta"}
          </button>
          <div className="hint">
            Completa Distancia, Tiempo de Viaje, Clima y Personas por Vehículo con datos reales de la ruta — revisalos igual, quedan editables.
          </div>
          {avisosAutocompletar.map((a, i) => (
            <div className="hint" style={{ color: "var(--warn)" }} key={i}>
              {a}
            </div>
          ))}
          {rutaPreview && (
            <div style={{ marginTop: 8 }}>
              <div className="hint" style={{ fontWeight: 600 }}>
                Distancia estimada: {rutaPreview.distanciaKm} km
              </div>
              <RutaMapa origen={rutaPreview.origen} destino={rutaPreview.destino} geometria={rutaPreview.geometria} />
            </div>
          )}
        </div>

        {sugierePuntoMedio && (
          <div className="field">
            <label>
              Punto medio <span className="opt">(recomendado para viajes largos)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: San Rafael"
              value={puntoMedio}
              onChange={(e) => setPuntoMedio(e.target.value)}
              disabled={submitting}
            />
            <div className="hint">Vas a poder marcar cuando pasen por acá, antes de llegar al destino.</div>
          </div>
        )}

        <div className="grid2">
          <div className="field">
            <label>
              Fecha y hora del viaje <span className="req">*</span>
            </label>
            <input type="datetime-local" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)} disabled={submitting} />
          </div>
          <div className="field">
            <label>Empresa</label>
            <input type="text" value={empresa} onChange={(e) => setEmpresa(e.target.value)} disabled={submitting} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Criterios de evaluación</div>
        {CRITERIO_KEYS.map((key) => (
          <div className="field" key={key}>
            <label>
              {CRITERIOS_RIESGO_VIAJE[key].label} <span className="req">*</span>
            </label>
            <select
              value={criterios[key]}
              onChange={(e) => setCriterios((prev) => ({ ...prev, [key]: e.target.value }))}
              disabled={submitting}
            >
              <option value="">Seleccionar...</option>
              {CRITERIOS_RIESGO_VIAJE[key].opciones.map((o) => (
                <option key={o.texto} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
            {key === "clima" && climaDescripcion && <div className="hint">Pronóstico para el destino: {climaDescripcion}</div>}
          </div>
        ))}

        {totalPreview != null && (
          <div className="hint" style={{ marginTop: 4 }}>
            Total provisorio: {totalPreview}
          </div>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="footer-nav">
        <span />
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar evaluación"}
        </button>
      </div>
    </div>
  );
}
