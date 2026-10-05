"use client";

import { useState } from "react";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import { entregarMaterialLibreAction } from "@/app/(app)/entregas-deposito/nueva/actions";
import { MOTIVO_ENTREGA_OPCIONES, MOTIVO_ENTREGA_LABEL, CONDICION_OPCIONES, CONDICION_LABEL } from "./types";
import { ErrorNote } from "@/components/notes";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { CondicionMaterial, MotivoEntregaDeposito } from "@/lib/database.types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface FormState {
  provinciaFiltro: string;
  ubicacionId: string;
  localidadNueva: string;
  sitioNueva: string;
  plantaNueva: string;
  oficinaNueva: string;
  gps: GpsCapturado | null;
  descripcion: string;
  categoria: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: string;
  condicion: CondicionMaterial;
  motivo: MotivoEntregaDeposito;
  comentario: string;
  fecha: string;
}

const EMPTY_FORM: FormState = {
  provinciaFiltro: "",
  ubicacionId: "",
  localidadNueva: "",
  sitioNueva: "",
  plantaNueva: "",
  oficinaNueva: "",
  gps: null,
  descripcion: "",
  categoria: "",
  marcaModelo: "",
  numeroSerie: "",
  etiquetaYpf: "",
  cantidad: "1",
  condicion: "usado_funcional",
  motivo: "sobrante_obra",
  comentario: "",
  fecha: hoyISO(),
};

/**
 * Entrega a depósito de material/equipo que nunca se registró como
 * equipamiento de un sitio (cables sueltos, repuestos, equipo nuevo sin
 * instalar) — por eso pide elegir/crear la Ubicación directo (mismo picker
 * de Informe Técnico/Rendición), en vez de partir de una fila ya cargada
 * como hace el botón "Entregar a depósito" de la ficha de Sitio.
 */
export function NuevaEntregaForm({ provincias, ubicaciones }: { provincias: string[]; ubicaciones: Ubicacion[] }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ numeroGeneracion: string } | null>(null);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function crear() {
    if (!form.descripcion.trim()) {
      setError("Describí qué material o equipo se entrega.");
      return;
    }
    if (!form.ubicacionId) {
      setError("Elegí o creá el sitio desde el que vuelve el material.");
      return;
    }
    const cantidad = Number(form.cantidad);
    if (!cantidad || cantidad < 1) {
      setError("La cantidad tiene que ser un número mayor a 0.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const res = await entregarMaterialLibreAction({
      ubicacionId: form.ubicacionId === "__new" ? null : form.ubicacionId,
      ubicacionNueva:
        form.ubicacionId === "__new"
          ? {
              provincia: form.provinciaFiltro,
              localidad: form.localidadNueva,
              sitio: form.sitioNueva,
              planta: form.plantaNueva,
              oficina: form.oficinaNueva,
            }
          : null,
      gps: form.gps,
      descripcion: form.descripcion,
      categoria: form.categoria,
      marcaModelo: form.marcaModelo,
      numeroSerie: form.numeroSerie,
      etiquetaYpf: form.etiquetaYpf,
      cantidad,
      condicion: form.condicion,
      motivo: form.motivo,
      comentario: form.comentario,
      fecha: form.fecha,
    });
    setSubmitting(false);
    if (!res.success || !res.numeroGeneracion) {
      setError(res.error || "No se pudo registrar la entrega.");
      return;
    }
    setResultado({ numeroGeneracion: res.numeroGeneracion });
    setForm(EMPTY_FORM);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Nueva Entrega a Depósito</h1>
        <p>Material o equipo que vuelve al depósito sin haber estado cargado como equipamiento de un sitio</p>
      </div>

      {resultado && (
        <div className="banner" style={{ marginBottom: 16 }}>
          Entrega registrada — comprobante <b>{resultado.numeroGeneracion}</b> generado. Lo encontrás en el{" "}
          <b>Historial</b>.
        </div>
      )}

      <div className="card">
        <div className="field">
          <label>
            Descripción del material/equipo <span className="req">*</span>
          </label>
          <input
            type="text"
            placeholder="Ej: 3 conectores RJ45 sobrantes, UPS nueva sin instalar..."
            value={form.descripcion}
            onChange={(e) => patch({ descripcion: e.target.value })}
            required
          />
        </div>

        <div className="grid2">
          <div className="field">
            <label>
              Categoría <span className="opt">(opcional)</span>
            </label>
            <input type="text" placeholder="Ej: Cables y conectores" value={form.categoria} onChange={(e) => patch({ categoria: e.target.value })} />
          </div>
          <div className="field">
            <label>
              Cantidad <span className="req">*</span>
            </label>
            <input type="number" min={1} step={1} value={form.cantidad} onChange={(e) => patch({ cantidad: e.target.value })} required />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>
              Marca/Modelo <span className="opt">(opcional)</span>
            </label>
            <input type="text" value={form.marcaModelo} onChange={(e) => patch({ marcaModelo: e.target.value })} />
          </div>
          <div className="field">
            <label>
              N° de Serie <span className="opt">(opcional)</span>
            </label>
            <input type="text" value={form.numeroSerie} onChange={(e) => patch({ numeroSerie: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label>
            Etiqueta YPF <span className="opt">(opcional)</span>
          </label>
          <input type="text" value={form.etiquetaYpf} onChange={(e) => patch({ etiquetaYpf: e.target.value })} />
        </div>

        <div className="section-label" style={{ marginTop: 4 }}>
          Sitio desde el que vuelve <span className="req">*</span>
        </div>
        <UbicacionFields
          ubicaciones={ubicaciones}
          provincias={provincias}
          provinciaFiltro={form.provinciaFiltro}
          onProvinciaFiltroChange={(p) =>
            patch({ provinciaFiltro: p, ubicacionId: "", localidadNueva: "", sitioNueva: "", plantaNueva: "", oficinaNueva: "" })
          }
          ubicacionId={form.ubicacionId}
          onUbicacionIdChange={(id) =>
            patch(id === "__new" ? { ubicacionId: id } : { ubicacionId: id, localidadNueva: "", sitioNueva: "", plantaNueva: "", oficinaNueva: "" })
          }
          localidadNueva={form.localidadNueva}
          onLocalidadNuevaChange={(v) => patch({ localidadNueva: v })}
          sitioNueva={form.sitioNueva}
          onSitioNuevaChange={(v) => patch({ sitioNueva: v })}
          plantaNueva={form.plantaNueva}
          onPlantaNuevaChange={(v) => patch({ plantaNueva: v })}
          oficinaNueva={form.oficinaNueva}
          onOficinaNuevaChange={(v) => patch({ oficinaNueva: v })}
          onGpsCapturado={(gps) => patch({ gps })}
        />

        <div className="grid2">
          <div className="field">
            <label>Condición</label>
            <select value={form.condicion} onChange={(e) => patch({ condicion: e.target.value as CondicionMaterial })}>
              {CONDICION_OPCIONES.map((c) => (
                <option key={c} value={c}>
                  {CONDICION_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => patch({ fecha: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label>Motivo</label>
          <select value={form.motivo} onChange={(e) => patch({ motivo: e.target.value as MotivoEntregaDeposito })}>
            {MOTIVO_ENTREGA_OPCIONES.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_ENTREGA_LABEL[m]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>
            Comentario <span className="opt">(opcional)</span>
          </label>
          <textarea value={form.comentario} onChange={(e) => patch({ comentario: e.target.value })} rows={2} />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={crear} disabled={submitting}>
            {submitting ? "Generando..." : "Registrar entrega"}
          </button>
        </div>
      </div>
    </div>
  );
}
