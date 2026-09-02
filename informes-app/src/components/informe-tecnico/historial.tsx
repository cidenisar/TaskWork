"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import JSZip from "jszip";
import { filtrarInformesPorConsulta, type HistorialInformeBuscable } from "@/lib/informe-tecnico/nl-search";
import { obtenerUrlPdfInformeAction } from "@/app/(app)/informe-tecnico/historial/actions";

export interface HistorialInformeRow extends HistorialInformeBuscable {
  id: string;
  pdfDisponible: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialInformes({ informes }: { informes: HistorialInformeRow[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => filtrarInformesPorConsulta(informes, query), [informes, query]);
  const selectableFiltered = filtered.filter((i) => i.pdfDisponible);
  const allSelected = selectableFiltered.length > 0 && selectableFiltered.every((i) => selected.has(i.id));

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? new Set(selectableFiltered.map((i) => i.id)) : new Set());
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function verDescargar(id: string, numeroGeneracion: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfInformeAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    const blob = await fetch(res.url).then((r) => r.blob());
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = res.filename || `${numeroGeneracion}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }

  async function descargarSeleccionados() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setNotice(null);
    try {
      const zip = new JSZip();
      let count = 0;
      for (const id of selected) {
        const informe = informes.find((i) => i.id === id);
        if (!informe) continue;
        const res = await obtenerUrlPdfInformeAction(id);
        if (!res.url) continue;
        const blob = await fetch(res.url).then((r) => r.blob());
        zip.file(res.filename || `${informe.numeroGeneracion}.pdf`, blob);
        count++;
      }
      if (count === 0) {
        setNotice("Ninguno de los informes seleccionados tiene PDF disponible.");
        return;
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informes-tecnicos-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial de Informes</h1>
        <p>El registro queda para siempre y se puede buscar; el PDF y las fotos son temporales</p>
      </div>

      <div className="banner">
        🔔 El <b>registro</b> (título, cliente, fecha, técnicos, N° de generación) se guarda para siempre y no ocupa
        casi lugar — es lo que te permite buscar cualquier informe viejo. El <b>PDF y las fotos</b> sí pesan, y se
        conservan solo hasta que los descargues o hasta el umbral configurado en Configuración — después se liberan
        del servidor. Un informe &quot;solo registro&quot; sigue apareciendo acá, solo que ya no tiene el archivo
        para volver a descargar.
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          🔍 Búsqueda en lenguaje natural — ej. &quot;el informe de aire acondicionado en YPF de agosto&quot;
        </div>
        <input
          type="text"
          className="search-box"
          placeholder="Buscá por título, cliente, ticket, técnico o describí el informe..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {selectableFiltered.length > 0 && (
          <div id="bulkBar">
            <div className="bulk-inner">
              <label className="bulk-select-all">
                <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                Seleccionar todos
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={selected.size === 0 || bulkBusy}
                onClick={descargarSeleccionados}
              >
                {bulkBusy ? "Preparando..." : `⬇ Descargar seleccionados (${selected.size})`}
              </button>
            </div>
          </div>
        )}

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtered.length === 0 ? (
          <div className="empty-note">No se encontraron informes con esa búsqueda.</div>
        ) : (
          <div>
            {filtered.map((i) => (
              <div className={`hist-item${i.pdfDisponible ? "" : " archived"}`} key={i.id}>
                <div className="info">
                  {i.pdfDisponible && (
                    <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleOne(i.id)} />
                  )}
                  <div className="hist-main">
                    <div className="hist-title">
                      {i.titulo}
                      <span className={`hist-status ${i.pdfDisponible ? "ok" : "gone"}`}>
                        {i.pdfDisponible ? "PDF disponible" : "Solo registro"}
                      </span>
                    </div>
                    <div className="hist-meta">
                      {i.numeroGeneracion} · {i.cliente} · {fmtFecha(i.fecha)}
                      {i.tecnicos.length ? ` · ${i.tecnicos.join(", ")}` : ""}
                    </div>
                  </div>
                </div>
                <div className="hist-actions">
                  {i.pdfDisponible && (
                    <Link href={`/informe-tecnico/editar/${i.id}`} className="icon-btn" title="Editar informe">
                      ✏️
                    </Link>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    title={i.pdfDisponible ? "Ver / descargar PDF" : "Sin PDF disponible"}
                    disabled={!i.pdfDisponible || busyId === i.id}
                    onClick={() => verDescargar(i.id, i.numeroGeneracion)}
                  >
                    {busyId === i.id ? "…" : "⬇"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
