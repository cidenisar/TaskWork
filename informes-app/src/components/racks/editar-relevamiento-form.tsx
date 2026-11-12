"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarRelevamientoRackAction } from "@/app/(app)/racks/editar/[id]/actions";
import { obtenerUrlPdfRelevamientoAction } from "@/app/(app)/racks/historial/actions";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Spinner } from "@/components/spinner";
import { CATEGORIA_EQUIPO_LABEL, ESTADO_OPCIONES } from "./types";
import { HallazgosInspeccionIaSection } from "@/components/inspeccion-ia/hallazgos-section";
import type { HallazgoInspeccionIa } from "@/lib/inspeccion-ia/types";
import type { EstadoChecklist, RackCategoriaEquipo } from "@/lib/database.types";

interface LecturaEditable {
  lecturaId: string;
  equipamientoId: string;
  numero: number;
  categoriaEquipo: RackCategoriaEquipo;
  texto: string;
  marcaModelo: string;
  posicionU: string;
  etiquetaYpf: string;
  numeroSerie: string;
  cantidad: number;
  estado: string;
  comentario: string;
}

/**
 * Edición solo para Administrador (ver actualizarRelevamientoRackAction) —
 * a propósito más chica que el formulario de alta: el rack, la ubicación y
 * qué equipamiento tiene el relevamiento NO se editan acá, solo fecha +
 * estado/comentario de cada lectura ya cargada + hallazgos de Inspección
 * IA. Mismo alcance que ya usa la edición de Informe Técnico.
 */
export function EditarRelevamientoForm({
  relevamientoId,
  numeroGeneracion,
  denominacion,
  ubicacionLabel,
  initialFecha,
  pdfDisponible,
  initialLecturas,
  initialHallazgos,
}: {
  relevamientoId: string;
  numeroGeneracion: string;
  denominacion: string;
  ubicacionLabel: string;
  initialFecha: string;
  pdfDisponible: boolean;
  initialLecturas: LecturaEditable[];
  initialHallazgos: HallazgoInspeccionIa[];
}) {
  const router = useRouter();
  const [fecha, setFecha] = useState(initialFecha);
  const [lecturas, setLecturas] = useState(initialLecturas);
  const [hallazgos, setHallazgos] = useState<HallazgoInspeccionIa[]>(initialHallazgos);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [verPdfBusy, setVerPdfBusy] = useState(false);

  function actualizarLectura(lecturaId: string, campo: "estado" | "comentario", valor: string) {
    setLecturas((prev) => prev.map((l) => (l.lecturaId === lecturaId ? { ...l, [campo]: valor } : l)));
  }

  function actualizarHallazgoEstado(itemId: string, estado: EstadoChecklist) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, estado: h.estado === estado ? null : estado } : h)));
  }

  function actualizarHallazgoComentario(itemId: string, comentario: string) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, comentario } : h)));
  }

  async function verPdf() {
    setVerPdfBusy(true);
    const res = await obtenerUrlPdfRelevamientoAction(relevamientoId);
    setVerPdfBusy(false);
    if (!res.url) {
      setError(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function guardar() {
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    const payload = {
      fecha,
      lecturas: lecturas.map((l) => ({ lecturaId: l.lecturaId, estado: l.estado, comentario: l.comentario })),
      hallazgos: hallazgos.map((h) => ({ itemId: h.itemId, estado: h.estado, comentario: h.comentario })),
    };
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    const res = await actualizarRelevamientoRackAction(relevamientoId, fd);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    setSuccess(true);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Editar relevamiento — {denominacion}</h1>
        <p>
          {numeroGeneracion} · {ubicacionLabel}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hint">
          Solo se puede corregir la fecha, el estado/comentario de cada equipo ya relevado y la Inspección IA — el rack, la
          ubicación y qué equipamiento tiene no se editan acá. Las fotos generales quedan como estaban.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <label>Equipamiento relevado</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {lecturas.map((l) => (
            <div key={l.lecturaId} style={{ border: "1px solid var(--field-border)", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                {l.numero}. {CATEGORIA_EQUIPO_LABEL[l.categoriaEquipo]} — {l.texto}
              </div>
              <div className="hint" style={{ margin: "0 0 8px" }}>
                {[l.marcaModelo, l.posicionU && `U${l.posicionU}`, l.etiquetaYpf, l.numeroSerie].filter(Boolean).join(" · ") || "—"}
                {l.cantidad > 1 ? ` · x${l.cantidad}` : ""}
              </div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                {ESTADO_OPCIONES.map((op) => (
                  <button
                    key={op}
                    type="button"
                    className={`btn btn-sm ${l.estado === op ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => actualizarLectura(l.lecturaId, "estado", l.estado === op ? "" : op)}
                    disabled={submitting}
                  >
                    {op}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Comentario (opcional)"
                value={l.comentario}
                onChange={(e) => actualizarLectura(l.lecturaId, "comentario", e.target.value)}
                disabled={submitting}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <HallazgosInspeccionIaSection
          hallazgos={hallazgos}
          onEstado={actualizarHallazgoEstado}
          onComentario={actualizarHallazgoComentario}
          disabled={submitting}
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {success && <SuccessNote>Cambios guardados — el PDF se regeneró.</SuccessNote>}

      <div className="fila-botones" style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting}>
          {submitting ? <Spinner size={14} /> : "Guardar cambios"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={verPdf} disabled={!pdfDisponible || verPdfBusy}>
          {verPdfBusy ? <Spinner size={14} /> : "Ver PDF"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => router.push("/racks/historial")} disabled={submitting}>
          Volver al Historial
        </button>
      </div>
    </div>
  );
}
