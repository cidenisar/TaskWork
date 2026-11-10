"use client";

import { useRef, useState } from "react";
import type { CatalogosInforme, InformeFormState } from "./types";
import { Icon, StatusDot } from "@/components/icon";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { UbicacionFields } from "@/components/ubicaciones/ubicacion-fields";

interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

/**
 * Dictado por voz + "Mejorar con IA" para un campo de texto largo —
 * independiente por campo (cada `useDictadoIA` tiene su propio estado), para
 * poder usarlo en más de un textarea del mismo wizard (Descripción del
 * Trabajo y Tareas Pendientes).
 */
function useDictadoIA(value: string, onChange: (v: string) => void, modo: "descripcion" | "lista_tareas" = "descripcion") {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<React.ReactNode>(null);
  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  async function mejorarConIA() {
    const texto = value.trim();
    if (!texto) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await fetch("/api/ai/mejorar-texto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, modo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiNote(
          <>
            <Icon name="warning" size={13} /> {data.error || "No se pudo mejorar el texto."}
          </>,
        );
      } else {
        onChange(data.mejorado);
        setAiNote(
          <>
            <Icon name="lightbulb" size={13} /> Texto corregido con IA. Revisalo antes de continuar.
          </>,
        );
      }
    } catch {
      setAiNote(
        <>
          <Icon name="warning" size={13} /> No se pudo contactar al servicio de IA.
        </>,
      );
    } finally {
      setAiBusy(false);
    }
  }

  function toggleDictation() {
    if (dictating) {
      recognitionRef.current?.stop();
      setDictating(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRec) {
      setAiNote(
        <>
          <Icon name="warning" size={13} /> Este navegador/dispositivo no soporta dictado por voz, o no se otorgó
          permiso de micrófono. Podés escribir directamente.
        </>,
      );
      return;
    }
    try {
      const recognition = new SpeechRec();
      recognition.lang = "es-AR";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (e) => {
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
        onChange((value.trim() ? value.trim() + " " : "") + text.trim());
      };
      recognition.onerror = () => setDictating(false);
      recognition.onend = () => setDictating(false);
      recognition.start();
      recognitionRef.current = recognition;
      setDictating(true);
    } catch {
      setAiNote(
        <>
          <Icon name="warning" size={13} /> No se pudo iniciar el dictado por voz en este navegador.
        </>,
      );
    }
  }

  return { aiBusy, aiNote, dictating, mejorarConIA, toggleDictation };
}

/** Botones "Dictar"/"Mejorar con IA" + nota de resultado, para un campo manejado por useDictadoIA. */
function DictadoIAControles({ ia }: { ia: ReturnType<typeof useDictadoIA> }) {
  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className={ia.dictating ? "ai-btn ai-btn-live" : "ai-btn"} onClick={ia.toggleDictation}>
          {ia.dictating ? (
            <>
              <StatusDot tone="danger" /> Escuchando...
            </>
          ) : (
            <>
              <Icon name="mic" size={13} /> Dictar
            </>
          )}
        </button>
        <button type="button" className="ai-btn" disabled={ia.aiBusy} onClick={ia.mejorarConIA}>
          <Icon name="sparkles" size={13} /> {ia.aiBusy ? "Mejorando..." : "Mejorar con IA"}
        </button>
      </div>
    </>
  );
}

export function Step1General({
  form,
  onChange,
  catalogos,
}: {
  form: InformeFormState;
  onChange: (patch: Partial<InformeFormState>) => void;
  catalogos: CatalogosInforme;
}) {
  const descripcionIA = useDictadoIA(form.descripcionTrabajo, (v) => onChange({ descripcionTrabajo: v }));
  const tareasIA = useDictadoIA(form.tareasPendientes, (v) => onChange({ tareasPendientes: v }), "lista_tareas");

  return (
    <div className="card">
      <div className="grid2">
        <div className="field">
          <label>
            Título del Informe <span className="req">*</span>
          </label>
          <input
            type="text"
            placeholder="Ej: Instalación de AA sala de energía"
            value={form.titulo}
            onChange={(e) => onChange({ titulo: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>
            Fecha <span className="req">*</span>
          </label>
          <input type="date" value={form.fecha} onChange={(e) => onChange({ fecha: e.target.value })} required />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>
            Cliente <span className="req">*</span>
          </label>
          <AutocompleteInput
            value={form.cliente}
            onChange={(v) => onChange({ cliente: v })}
            suggestions={catalogos.clientes}
            placeholder="Nombre del cliente"
            required
          />
        </div>
        <div className="field">
          <label>
            Proyecto <span className="req">*</span>
          </label>
          <input
            type="text"
            placeholder="Ej: Ed. Comunicaciones CILC"
            value={form.proyecto}
            onChange={(e) => onChange({ proyecto: e.target.value })}
            required
          />
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>
            Ticket / N° Incidente <span className="opt">(opcional)</span>
          </label>
          <input
            type="text"
            placeholder="Ej: RITM2481765"
            value={form.ticketNumero}
            onChange={(e) => onChange({ ticketNumero: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Tipo de Informe</label>
          <select
            value={catalogos.tiposInforme.includes(form.tipoInforme) || form.tipoInforme === "__new" ? form.tipoInforme : ""}
            onChange={(e) => onChange({ tipoInforme: e.target.value, tipoInformeNuevo: "" })}
          >
            <option value="">Seleccionar tipo...</option>
            {catalogos.tiposInforme.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="__new">+ Agregar nuevo tipo...</option>
          </select>
          {form.tipoInforme === "__new" && (
            <input
              type="text"
              placeholder="Nombre del nuevo tipo"
              value={form.tipoInformeNuevo}
              onChange={(e) => onChange({ tipoInformeNuevo: e.target.value })}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      </div>
      <div className="field">
        <label>
          Permiso de Trabajo <span className="opt">(opcional)</span>
        </label>
        <input
          type="text"
          placeholder="N° de permiso de trabajo"
          value={form.permisoTrabajo}
          onChange={(e) => onChange({ permisoTrabajo: e.target.value })}
        />
      </div>
      <div className="section-label" style={{ marginTop: 4 }}>
        Ubicación <span className="opt">(opcional)</span>
      </div>
      <UbicacionFields
        ubicaciones={catalogos.ubicaciones}
        provincias={catalogos.provincias}
        provinciaFiltro={form.provinciaFiltro}
        onProvinciaFiltroChange={(p) =>
          onChange({ provinciaFiltro: p, ubicacionId: "", localidadNueva: "", sitioNueva: "", plantaNueva: "", oficinaNueva: "" })
        }
        ubicacionId={form.ubicacionId}
        onUbicacionIdChange={(id) =>
          onChange(
            id === "__new"
              ? { ubicacionId: id }
              : { ubicacionId: id, localidadNueva: "", sitioNueva: "", plantaNueva: "", oficinaNueva: "" },
          )
        }
        localidadNueva={form.localidadNueva}
        onLocalidadNuevaChange={(v) => onChange({ localidadNueva: v })}
        sitioNueva={form.sitioNueva}
        onSitioNuevaChange={(v) => onChange({ sitioNueva: v })}
        plantaNueva={form.plantaNueva}
        onPlantaNuevaChange={(v) => onChange({ plantaNueva: v })}
        oficinaNueva={form.oficinaNueva}
        onOficinaNuevaChange={(v) => onChange({ oficinaNueva: v })}
        onGpsCapturado={(gps) => onChange({ gps })}
        requerido={false}
      />
      <div className="field">
        <div className="field-label-row">
          <label>Descripción del Trabajo</label>
          <DictadoIAControles ia={descripcionIA} />
        </div>
        <textarea
          placeholder="Describe el trabajo realizado..."
          value={form.descripcionTrabajo}
          onChange={(e) => onChange({ descripcionTrabajo: e.target.value })}
        />
        {descripcionIA.aiNote && (
          <div className="ai-note">
            <span>{descripcionIA.aiNote}</span>
          </div>
        )}
      </div>
      <div className="field">
        <div className="field-label-row">
          <label>
            Tareas Pendientes <span className="opt">(opcional)</span>
          </label>
          <DictadoIAControles ia={tareasIA} />
        </div>
        <textarea
          placeholder={"Una tarea por línea, ej:\nConexionado de cables en unidad exterior\nOrden y limpieza en sala de energía"}
          value={form.tareasPendientes}
          onChange={(e) => onChange({ tareasPendientes: e.target.value })}
        />
        {tareasIA.aiNote && (
          <div className="ai-note">
            <span>{tareasIA.aiNote}</span>
          </div>
        )}
        <div className="hint">Se listan en el PDF como viñetas, una por línea.</div>
      </div>
    </div>
  );
}
