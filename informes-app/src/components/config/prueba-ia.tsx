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
 * Esquema "combinado": votan las IAs gratis (todas menos Claude). Por cada
 * comprobante, si al menos 2 coinciden en fecha y monto → se acepta ese
 * valor. Si no hay mayoría → se marca para revisar. Si responde una sola →
 * se usa esa, sin control. Si no responde ninguna → carga manual.
 */
function combinada(resultados: Resultado[]): { texto: string; tono: "ok" | "revisar" | "error" } {
  const gratis = resultados.filter(
    (r) => !r.proveedor.startsWith("Claude") && r.ok && r.comprobantes && r.comprobantes.length > 0,
  );
  const nombre = (r: Resultado) => r.proveedor.split(" ")[0];
  if (gratis.length === 0) return { texto: "No respondió ninguna IA gratis → carga manual", tono: "error" };
  if (gratis.length === 1) return { texto: `Solo respondió ${nombre(gratis[0])} → se usa esa, sin control`, tono: "revisar" };

  // Cantidad de comprobantes: la que más se repite.
  const cuentas = gratis.map((r) => r.comprobantes!.length);
  const cant = [...cuentas].sort((a, b) => cuentas.filter((x) => x === b).length - cuentas.filter((x) => x === a).length)[0];
  const deAcuerdoCant = gratis.filter((r) => r.comprobantes!.length === cant);
  const avisos: string[] = [];
  if (deAcuerdoCant.length < 2) avisos.push(`cantidad de comprobantes (${cuentas.join(" / ")})`);

  const aceptados: string[] = [];
  for (let i = 0; i < cant; i++) {
    const pre = cant > 1 ? `#${i + 1} ` : "";
    for (const campo of ["monto", "fecha"] as const) {
      const votos = new Map<string, string[]>();
      for (const r of gratis) {
        const c = (r.comprobantes as Comprobante[])[i];
        if (!c) continue;
        const v = String(c[campo] ?? "—");
        votos.set(v, [...(votos.get(v) ?? []), nombre(r)]);
      }
      const [ganador, quienes] = [...votos.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ["—", []];
      const mostrar = (v: string) => (campo === "monto" && v !== "—" ? fmt(Number(v)) : v);
      if (quienes.length >= 2) {
        if (campo === "monto") aceptados.push(`${pre}${mostrar(ganador)}`);
        else aceptados[aceptados.length - 1] += ` · ${mostrar(ganador)}`;
        if (votos.size > 1) {
          const disidentes = [...votos.entries()].filter(([v]) => v !== ganador).map(([v, q]) => `${q.join("/")} dijo ${mostrar(v)}`);
          avisos.push(`${pre}${campo}: mayoría ${quienes.join("+")}, ${disidentes.join(", ")} (se toma la mayoría)`);
        }
      } else {
        if (campo === "monto") aceptados.push(`${pre}?`);
        avisos.push(`${pre}${campo} sin mayoría (${[...votos.entries()].map(([v, q]) => `${q.join("/")}: ${mostrar(v)}`).join("; ")})`);
      }
    }
  }
  const sinMayoria = avisos.some((a) => a.includes("sin mayoría") || a.startsWith("cantidad"));
  if (sinMayoria) return { texto: `Marcar para revisar: ${avisos.join("; ")}`, tono: "revisar" };
  const base = `${gratis.length === 3 ? "Mayoría" : "Coinciden"} ✓ ${aceptados.join(" | ")}`;
  return { texto: avisos.length ? `${base} — ojo: ${avisos.join("; ")}` : base, tono: "ok" };
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
                        <strong>Combinada (IAs gratis):</strong> {c.texto}
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
