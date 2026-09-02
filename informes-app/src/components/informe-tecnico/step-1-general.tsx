"use client";

import { useRef, useState } from "react";
import type { CatalogosInforme, InformeFormState } from "./types";

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

export function Step1General({
  form,
  onChange,
  catalogos,
  logoUrl,
}: {
  form: InformeFormState;
  onChange: (patch: Partial<InformeFormState>) => void;
  catalogos: CatalogosInforme;
  logoUrl: string | null;
}) {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  async function mejorarConIA() {
    const texto = form.descripcionTrabajo.trim();
    if (!texto) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await fetch("/api/ai/mejorar-texto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiNote(`⚠️ ${data.error || "No se pudo mejorar el texto."}`);
      } else {
        onChange({ descripcionTrabajo: data.mejorado });
        setAiNote("💡 Texto corregido con IA. Revisalo antes de continuar.");
      }
    } catch {
      setAiNote("⚠️ No se pudo contactar al servicio de IA.");
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
        "⚠️ Este navegador/dispositivo no soporta dictado por voz, o no se otorgó permiso de micrófono. Podés escribir la descripción directamente.",
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
        onChange({
          descripcionTrabajo: (form.descripcionTrabajo.trim() ? form.descripcionTrabajo.trim() + " " : "") + text.trim(),
        });
      };
      recognition.onerror = () => setDictating(false);
      recognition.onend = () => setDictating(false);
      recognition.start();
      recognitionRef.current = recognition;
      setDictating(true);
    } catch {
      setAiNote("⚠️ No se pudo iniciar el dictado por voz en este navegador.");
    }
  }

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
          <input
            type="text"
            placeholder="Nombre del cliente"
            value={form.cliente}
            onChange={(e) => onChange({ cliente: e.target.value })}
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
      <div className="grid2">
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
        <div className="field">
          <label>Provincia</label>
          <select value={form.provincia} onChange={(e) => onChange({ provincia: e.target.value })}>
            <option value="">Seleccionar provincia...</option>
            {catalogos.provincias.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Ubicación</label>
        <input
          type="text"
          placeholder="Dirección o ubicación"
          value={form.ubicacion}
          onChange={(e) => onChange({ ubicacion: e.target.value })}
        />
      </div>
      <div className="field">
        <div className="field-label-row">
          <label>Descripción del Trabajo</label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ai-btn" onClick={toggleDictation}>
              {dictating ? "⏺ Escuchando..." : "🎤 Dictar"}
            </button>
            <button type="button" className="ai-btn" disabled={aiBusy} onClick={mejorarConIA}>
              {aiBusy ? "✨ Mejorando..." : "✨ Mejorar con IA"}
            </button>
          </div>
        </div>
        <textarea
          placeholder="Describe el trabajo realizado..."
          value={form.descripcionTrabajo}
          onChange={(e) => onChange({ descripcionTrabajo: e.target.value })}
        />
        {aiNote && (
          <div className="ai-note">
            <span>{aiNote}</span>
          </div>
        )}
      </div>
      <div className="field">
        <label>
          Tareas Pendientes <span className="opt">(opcional)</span>
        </label>
        <textarea
          placeholder={"Una tarea por línea, ej:\nConexionado de cables en unidad exterior\nOrden y limpieza en sala de energía"}
          value={form.tareasPendientes}
          onChange={(e) => onChange({ tareasPendientes: e.target.value })}
        />
        <div className="hint">Se listan en el PDF como viñetas, una por línea.</div>
      </div>
      <div className="field">
        <label>Logo de la Empresa</label>
        <div className="logo-upload">
          <div className="logo-preview">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo de la empresa" />
            ) : (
              "🏢"
            )}
          </div>
          <span className="hint" style={{ marginTop: 0 }}>
            {logoUrl
              ? "Se usa el logo configurado en Configuración → Datos de la Empresa. Aparecerá en la cabecera de este PDF automáticamente."
              : "Todavía no hay un logo cargado. Un Administrador puede subirlo en Configuración → Datos de la Empresa."}
          </span>
        </div>
      </div>
    </div>
  );
}
