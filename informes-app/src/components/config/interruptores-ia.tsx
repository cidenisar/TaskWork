"use client";

import { useState } from "react";
import { cambiarConfigIaAction } from "@/app/(app)/configuracion/actions/ia";
import type { ModoIa } from "@/lib/database.types";
import type { ProveedorIa } from "@/lib/ai/motor";

export interface FilaHistorialIa {
  id: string;
  campo: string;
  antes: string | null;
  despues: string | null;
  quien: string;
  cuando: string;
}

const DESCRIPCION: Record<ProveedorIa, string> = {
  claude: "La de siempre. La más precisa, pero es paga (cada lectura consume crédito de Anthropic).",
  cloudflare: "Gratis, ~10.000 'neuronas' por día. No usa tus datos para entrenar.",
  groq: "Gratis y muy rápida, pero con límite de unas 3 fotos por minuto.",
  openrouter: "Gratis, 50 consultas por día (modelo de imágenes de NVIDIA).",
  nvidia: "Gratis para pruebas (NVIDIA pide licencia para uso en producción).",
};

const CAMPO: Record<ProveedorIa, "claude_activo" | "cloudflare_activo" | "groq_activo" | "openrouter_activo" | "nvidia_activo"> = {
  claude: "claude_activo",
  cloudflare: "cloudflare_activo",
  groq: "groq_activo",
  openrouter: "openrouter_activo",
  nvidia: "nvidia_activo",
};

const NOMBRE_CAMPO: Record<string, string> = {
  claude_activo: "Claude",
  cloudflare_activo: "Cloudflare",
  groq_activo: "Groq",
  openrouter_activo: "OpenRouter",
  nvidia_activo: "NVIDIA",
  modo: "Modo",
};

function valorLegible(campo: string, v: string | null) {
  if (campo === "modo") return v === "en_orden" ? "En orden" : "Combinada";
  return v === "true" ? "Prendida" : "Apagada";
}

export function InterruptoresIaCard({
  proveedores,
  activos: activosIniciales,
  modo: modoInicial,
  historial,
}: {
  proveedores: { id: ProveedorIa; nombre: string; gratis: boolean; configurado: boolean }[];
  activos: Record<ProveedorIa, boolean>;
  modo: ModoIa;
  historial: FilaHistorialIa[];
}) {
  const [activos, setActivos] = useState(activosIniciales);
  const [modo, setModo] = useState(modoInicial);
  const [error, setError] = useState<string | null>(null);

  const prendidas = proveedores.filter((p) => activos[p.id] && p.configurado).length;

  async function toggle(id: ProveedorIa) {
    const next = !activos[id];
    setActivos((a) => ({ ...a, [id]: next }));
    setError(null);
    const res = await cambiarConfigIaAction(CAMPO[id], next);
    if (!res.success) {
      setActivos((a) => ({ ...a, [id]: !next }));
      setError(res.error ?? "No se pudo guardar.");
    }
  }

  async function cambiarModo(m: ModoIa) {
    const antes = modo;
    setModo(m);
    setError(null);
    const res = await cambiarConfigIaAction("modo", m);
    if (!res.success) {
      setModo(antes);
      setError(res.error ?? "No se pudo guardar.");
    }
  }

  return (
    <>
      <div className="card">
        <div className="section-label">IAs que usa la app</div>
        <div className="hint" style={{ margin: "-6px 0 14px" }}>
          Por ahora aplica a la lectura de tickets, equipos, racks, torres, vehículos, remitos, entregas, verificación de instalación y
          &quot;Mejorar con IA&quot;. Tableros/unifilares, ubicaciones y estadísticas siguen usando Claude.
        </div>
        {proveedores.map((p) => (
          <div className="switch-row" style={{ paddingTop: 14 }} key={p.id}>
            <div className="txt">
              <b>
                {p.nombre} {p.gratis ? "· gratis" : "· paga"}
              </b>
              <span>
                {DESCRIPCION[p.id]}
                {!p.configurado && " Falta cargar su clave en Vercel: aunque la prendas no se va a usar."}
              </span>
            </div>
            <label className="switch">
              <input type="checkbox" checked={activos[p.id]} onChange={() => toggle(p.id)} aria-label={`Usar ${p.nombre}`} />
              <span className="slider"></span>
            </label>
          </div>
        ))}
        {prendidas === 0 && (
          <div className="hint" style={{ marginTop: 12, color: "#b42318" }}>
            No hay ninguna IA prendida y con clave: la lectura de fotos queda apagada y los técnicos cargan todo a mano.
          </div>
        )}
        {error && (
          <div className="hint" style={{ marginTop: 12, color: "#b42318" }}>
            {error}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Cómo se combinan</div>
        <div className="radio-group">
          <label className="radio-opt">
            <input type="radio" name="modo-ia" checked={modo === "combinada"} onChange={() => cambiarModo("combinada")} />
            <span>
              <b>Combinada</b>
              <br />
              Todas las IAs prendidas leen la misma foto a la vez y, campo por campo, se toma el valor en el que coinciden al menos dos.
              Si no hay mayoría se usa el de la IA de más arriba en la lista. Más segura, un poco más lenta.
            </span>
          </label>
          <label className="radio-opt">
            <input type="radio" name="modo-ia" checked={modo === "en_orden"} onChange={() => cambiarModo("en_orden")} />
            <span>
              <b>En orden</b>
              <br />
              Se usa la primera IA prendida de la lista que responda; si falla o se quedó sin cupo, pasa a la siguiente. Más rápida, sin
              control cruzado.
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Historial de cambios</div>
        {historial.length === 0 ? (
          <div className="hint">Todavía no hubo cambios.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: 4 }}>Cuándo</th>
                  <th style={{ padding: 4 }}>Quién</th>
                  <th style={{ padding: 4 }}>Qué</th>
                  <th style={{ padding: 4 }}>Antes</th>
                  <th style={{ padding: 4 }}>Después</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id} style={{ borderTop: "1px solid var(--border-soft)" }}>
                    <td style={{ padding: 4 }}>
                      {new Date(h.cuando).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
                    </td>
                    <td style={{ padding: 4 }}>{h.quien}</td>
                    <td style={{ padding: 4 }}>{NOMBRE_CAMPO[h.campo] ?? h.campo}</td>
                    <td style={{ padding: 4 }}>{valorLegible(h.campo, h.antes)}</td>
                    <td style={{ padding: 4 }}>{valorLegible(h.campo, h.despues)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
