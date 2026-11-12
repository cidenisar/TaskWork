"use client";

import { useState } from "react";
import { resizeImageToJpeg } from "@/lib/image-resize";

interface Comprobante {
  fecha?: string | null;
  monto?: number | null;
  comercio?: string | null;
  descripcion?: string | null;
}
interface Resultado {
  proveedor: string;
  modelo: string;
  ok: boolean;
  ms: number;
  comprobantes?: Comprobante[];
  crudo?: string;
  error?: string;
}
interface Fila {
  nombre: string;
  preview: string;
  estado: "esperando" | "leyendo" | "listo" | "error";
  resultados?: Resultado[];
  error?: string;
}

const fmt = (n: number | null | undefined) => (typeof n === "number" ? `$ ${n.toLocaleString("es-AR")}` : "—");

/**
 * Esquema "combinado" propuesto: Cloudflare principal + Groq de control.
 * Si las dos leen igual fecha y monto → se acepta. Si difieren → esos
 * campos quedan marcados para revisar. Si una falla → se usa la otra.
 */
function combinada(resultados: Resultado[]): { texto: string; tono: "ok" | "revisar" | "error" } {
  const usable = (r?: Resultado) => (r && r.ok && r.comprobantes && r.comprobantes.length > 0 ? r : undefined);
  const cf = usable(resultados.find((r) => r.proveedor.startsWith("Cloudflare")));
  const gq = usable(resultados.find((r) => r.proveedor.startsWith("Groq")));
  if (!cf && !gq) return { texto: "Fallaron las dos → carga manual", tono: "error" };
  if (!cf || !gq) {
    const una = (cf ?? gq)!;
    return { texto: `Solo respondió ${una.proveedor.split(" ")[0]} → se usa esa, sin control`, tono: "revisar" };
  }
  const a = cf.comprobantes as Comprobante[];
  const b = gq.comprobantes as Comprobante[];
  const avisos: string[] = [];
  if (a.length !== b.length) avisos.push(`cantidad de comprobantes (${a.length} vs ${b.length})`);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const pre = a.length > 1 ? `#${i + 1} ` : "";
    if ((a[i].monto ?? null) !== (b[i].monto ?? null)) avisos.push(`${pre}monto (${fmt(a[i].monto)} vs ${fmt(b[i].monto)})`);
    if ((a[i].fecha ?? null) !== (b[i].fecha ?? null)) avisos.push(`${pre}fecha (${a[i].fecha ?? "—"} vs ${b[i].fecha ?? "—"})`);
  }
  if (avisos.length === 0) {
    const resumen = a.map((c) => `${c.fecha ?? "—"} · ${fmt(c.monto)}`).join(" | ");
    return { texto: `Coinciden ✓ ${resumen}`, tono: "ok" };
  }
  return { texto: `Marcar para revisar: ${avisos.join("; ")}`, tono: "revisar" };
}

export function PruebaIa() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [corriendo, setCorriendo] = useState(false);

  async function correr(files: FileList | null) {
    if (!files || files.length === 0) return;
    const lista = Array.from(files);
    const iniciales: Fila[] = lista.map((f) => ({ nombre: f.name, preview: URL.createObjectURL(f), estado: "esperando" }));
    setFilas(iniciales);
    setCorriendo(true);

    // Una foto por vez: las cuentas gratis tienen límite por minuto.
    for (let i = 0; i < lista.length; i++) {
      setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, estado: "leyendo" } : f)));
      try {
        const blob = await resizeImageToJpeg(lista[i]);
        const fd = new FormData();
        fd.append("foto", new File([blob], "foto.jpg", { type: "image/jpeg" }));
        const res = await fetch("/api/admin/prueba-ia", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
        setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, estado: "listo", resultados: json.resultados } : f)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, estado: "error", error: msg } : f)));
      }
    }
    setCorriendo(false);
  }

  return (
    <div className="card">
      <div className="section-label">Elegí una o varias fotos de tickets</div>
      <p className="hint">
        Cada foto se manda a todas las IAs configuradas con la misma instrucción. No se guarda nada: es solo para comparar.
      </p>
      <input type="file" accept="image/*" multiple disabled={corriendo} onChange={(e) => correr(e.target.files)} />

      {filas.map((f, i) => (
        <div key={i} style={{ marginTop: 18, borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.preview} alt={f.nombre} style={{ width: 90, borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Foto {i + 1}</strong>{" "}
              <span className="hint">
                {f.estado === "esperando" && "en espera"}
                {f.estado === "leyendo" && "leyendo…"}
                {f.estado === "error" && `error: ${f.error}`}
              </span>
              {f.resultados && (
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left" }}>
                        <th style={{ padding: 4 }}>IA</th>
                        <th style={{ padding: 4 }}>Fecha</th>
                        <th style={{ padding: 4 }}>Monto</th>
                        <th style={{ padding: 4 }}>Comercio</th>
                        <th style={{ padding: 4 }}>Descripción</th>
                        <th style={{ padding: 4 }}>Tiempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.resultados.flatMap((r) => {
                        if (!r.ok || !r.comprobantes || r.comprobantes.length === 0) {
                          return [
                            <tr key={r.proveedor} style={{ borderTop: "1px solid var(--border-soft)" }}>
                              <td style={{ padding: 4 }}>
                                <strong>{r.proveedor}</strong>
                                <div className="hint">{r.modelo}</div>
                              </td>
                              <td colSpan={4} style={{ padding: 4, color: "#b42318" }}>
                                {r.error ?? `No devolvió datos usables: ${r.crudo?.slice(0, 200) ?? ""}`}
                              </td>
                              <td style={{ padding: 4 }}>{(r.ms / 1000).toFixed(1)} s</td>
                            </tr>,
                          ];
                        }
                        return r.comprobantes.map((c, k) => (
                          <tr key={`${r.proveedor}-${k}`} style={{ borderTop: k === 0 ? "1px solid var(--border-soft)" : undefined }}>
                            <td style={{ padding: 4 }}>
                              {k === 0 && (
                                <>
                                  <strong>{r.proveedor}</strong>
                                  <div className="hint">{r.modelo}</div>
                                </>
                              )}
                            </td>
                            <td style={{ padding: 4 }}>{c.fecha ?? "—"}</td>
                            <td style={{ padding: 4 }}>{fmt(c.monto)}</td>
                            <td style={{ padding: 4 }}>{c.comercio ?? "—"}</td>
                            <td style={{ padding: 4 }}>{c.descripcion ?? "—"}</td>
                            <td style={{ padding: 4 }}>{k === 0 ? `${(r.ms / 1000).toFixed(1)} s` : ""}</td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                  {(() => {
                    const c = combinada(f.resultados);
                    const color = c.tono === "ok" ? "#1a7f37" : c.tono === "revisar" ? "#9a6700" : "#b42318";
                    const fondo = c.tono === "ok" ? "#dafbe1" : c.tono === "revisar" ? "#fff8c5" : "#ffebe9";
                    return (
                      <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: fondo, color, fontSize: 13 }}>
                        <strong>Combinada (Cloudflare + Groq):</strong> {c.texto}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
