"use client";

import { useState } from "react";
import { guardarParametroGuardiaAction } from "@/app/panel/guardia/parametros/actions";

interface ConfigGuardia {
  entrada_min: number;
  salida_activacion_min: number;
  madrugada_hasta_min: number;
  tope_media_min: number;
  valor_media: number;
  valor_entera: number;
  cambio_min: number;
  periodo_desde: string;
  periodo_hasta: string;
  grupo_whatsapp_nombre: string;
}

type Campo = keyof ConfigGuardia;

interface HistEntry {
  id: string;
  campo: string;
  antes: string | null;
  despues: string | null;
  quien: string;
  cuando: string;
}

function minutosATexto(min: number): string {
  const h = Math.floor(min / 60)
    .toString()
    .padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function textoAMinutos(texto: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const CAMPOS_HORA: { campo: Campo; label: string; nota: string }[] = [
  { campo: "entrada_min", label: "Entrada (día hábil)", nota: "Desde acá, en día hábil, un llamado es dedicación funcional" },
  { campo: "salida_activacion_min", label: "Salida / activación", nota: "Desde acá, en día hábil, un llamado es activación" },
  { campo: "madrugada_hasta_min", label: "Madrugada hasta", nota: "Una activación de madrugada cuenta solo hasta acá" },
  { campo: "tope_media_min", label: "Tope de media activación", nota: "Hasta esto en el día = media activación; más = entera" },
  { campo: "cambio_min", label: "Hora de cambio de guardia (miércoles)", nota: "Cuándo entra la guardia nueva de la semana" },
];

export function ParametrosGuardiaCard({ config, historial }: { config: ConfigGuardia; historial: HistEntry[] }) {
  const [valores, setValores] = useState(config);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busyCampo, setBusyCampo] = useState<Campo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardar(campo: Campo, valorNuevo: string | number) {
    const anterior = valores[campo];
    setBusyCampo(campo);
    setError(null);
    setValores((prev) => ({ ...prev, [campo]: valorNuevo }));
    const res = await guardarParametroGuardiaAction(campo, valorNuevo as never);
    setBusyCampo(null);
    if (!res.success) {
      setValores((prev) => ({ ...prev, [campo]: anterior }));
      setError(res.error || "No se pudo guardar.");
    }
  }

  function commitHora(campo: Campo) {
    const texto = edit[campo];
    setEdit((prev) => {
      const next = { ...prev };
      delete next[campo];
      return next;
    });
    if (texto === undefined) return;
    const min = textoAMinutos(texto);
    if (min === null) {
      setError(`"${texto}" no es una hora válida (HH:MM).`);
      return;
    }
    if (min === valores[campo]) return;
    guardar(campo, min);
  }

  function commitCentesima(campo: "valor_media" | "valor_entera") {
    const texto = edit[campo];
    setEdit((prev) => {
      const next = { ...prev };
      delete next[campo];
      return next;
    });
    if (texto === undefined) return;
    const decimal = Number(texto.replace(",", "."));
    if (!Number.isFinite(decimal) || decimal <= 0) {
      setError(`"${texto}" no es un valor válido.`);
      return;
    }
    const centesimas = Math.round(decimal * 100);
    if (centesimas === valores[campo]) return;
    guardar(campo, centesimas);
  }

  function commitFecha(campo: "periodo_desde" | "periodo_hasta", valor: string) {
    if (!valor || valor === valores[campo]) return;
    guardar(campo, valor);
  }

  function commitTexto(campo: "grupo_whatsapp_nombre") {
    const texto = edit[campo];
    setEdit((prev) => {
      const next = { ...prev };
      delete next[campo];
      return next;
    });
    if (texto === undefined) return;
    if (!texto.trim()) {
      setError("Falta el nombre del grupo.");
      return;
    }
    if (texto.trim() === valores[campo]) return;
    guardar(campo, texto.trim());
  }

  return (
    <>
      <div className="card">
        <div className="section-label">Horarios</div>
        <div className="tech-form-grid" style={{ marginTop: 10 }}>
          {CAMPOS_HORA.map(({ campo, label, nota }) => (
            <div className="field" key={campo}>
              <label>{label}</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                value={edit[campo] ?? minutosATexto(valores[campo] as number)}
                onChange={(e) => setEdit((prev) => ({ ...prev, [campo]: e.target.value }))}
                onBlur={() => commitHora(campo)}
                disabled={busyCampo === campo}
              />
              <div className="item-sub">{nota}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Valores de activación</div>
        <div className="tech-form-grid" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Media activación</label>
            <input
              type="text"
              inputMode="decimal"
              value={edit.valor_media ?? (valores.valor_media / 100).toFixed(2)}
              onChange={(e) => setEdit((prev) => ({ ...prev, valor_media: e.target.value }))}
              onBlur={() => commitCentesima("valor_media")}
              disabled={busyCampo === "valor_media"}
            />
          </div>
          <div className="field">
            <label>Activación entera</label>
            <input
              type="text"
              inputMode="decimal"
              value={edit.valor_entera ?? (valores.valor_entera / 100).toFixed(2)}
              onChange={(e) => setEdit((prev) => ({ ...prev, valor_entera: e.target.value }))}
              onBlur={() => commitCentesima("valor_entera")}
              disabled={busyCampo === "valor_entera"}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Período de liquidación</div>
        <p className="empty-note">Vale hacia adelante — un cambio nunca mueve un período ya cerrado.</p>
        <div className="tech-form-grid" style={{ marginTop: 10 }}>
          <div className="field">
            <label>Desde</label>
            <input
              type="date"
              defaultValue={valores.periodo_desde}
              onChange={(e) => commitFecha("periodo_desde", e.target.value)}
              disabled={busyCampo === "periodo_desde"}
            />
          </div>
          <div className="field">
            <label>Hasta</label>
            <input
              type="date"
              defaultValue={valores.periodo_hasta}
              onChange={(e) => commitFecha("periodo_hasta", e.target.value)}
              disabled={busyCampo === "periodo_hasta"}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">WhatsApp</div>
        <p className="empty-note">
          Un link de WhatsApp no puede abrir un grupo directamente — esto es solo el nombre que se muestra en pantalla para recordar
          a quién avisar manualmente al compartir una novedad.
        </p>
        <div className="field" style={{ marginTop: 10, maxWidth: 320 }}>
          <label>Grupo de novedades</label>
          <input
            type="text"
            value={edit.grupo_whatsapp_nombre ?? valores.grupo_whatsapp_nombre}
            onChange={(e) => setEdit((prev) => ({ ...prev, grupo_whatsapp_nombre: e.target.value }))}
            onBlur={() => commitTexto("grupo_whatsapp_nombre")}
            disabled={busyCampo === "grupo_whatsapp_nombre"}
          />
        </div>
      </div>

      {error && (
        <div className="error-text" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-label">Historial de cambios</div>
        <div className="item-list">
          {historial.map((h) => (
            <div className="list-item" key={h.id}>
              <div className="info">
                <div>
                  <div className="item-name">{h.campo}</div>
                  <div className="item-sub">
                    {h.antes ?? "—"} → {h.despues ?? "—"} · {h.quien} · {new Date(h.cuando).toLocaleString("es-AR")}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {historial.length === 0 && <p className="empty-note">Todavía no se cambió ningún parámetro.</p>}
        </div>
      </div>
    </>
  );
}
