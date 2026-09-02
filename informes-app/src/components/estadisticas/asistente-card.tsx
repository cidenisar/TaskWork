"use client";

import { useState } from "react";

const QUICK_ASKS = [
  "¿Cuánto gastamos en combustible este mes?",
  "¿Qué técnico generó más informes este mes?",
  "¿Cuántas rendiciones siguen sin cerrar?",
];

export function AsistenteCard() {
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function preguntar(texto: string) {
    if (!texto.trim() || busy) return;
    setBusy(true);
    setError(null);
    setRespuesta(null);
    try {
      const res = await fetch("/api/estadisticas/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: texto }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo responder la pregunta.");
      } else {
        setRespuesta(data.respuesta);
      }
    } catch {
      setError("No se pudo contactar al servicio de IA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="section-label">💬 Preguntale a tus datos</div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Buscá en lenguaje natural sobre todo el histórico de informes y gastos.
      </div>
      <div className="email-row">
        <input
          type="text"
          placeholder="Ej: ¿Cuánto gastamos en combustible en agosto?"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && preguntar(pregunta)}
          disabled={busy}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => preguntar(pregunta)} disabled={busy}>
          {busy ? "..." : "Preguntar"}
        </button>
      </div>
      <div className="quick-asks">
        {QUICK_ASKS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              setPregunta(q);
              preguntar(q);
            }}
            disabled={busy}
          >
            {q}
          </button>
        ))}
      </div>
      {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      {respuesta && (
        <div className="stats-answer">
          <span>💬</span>
          <span>{respuesta}</span>
        </div>
      )}
    </div>
  );
}
