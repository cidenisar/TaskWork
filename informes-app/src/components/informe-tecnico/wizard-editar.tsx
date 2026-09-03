"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper, type WizardStep } from "@/components/ui/stepper";
import type { Tecnico, Vehiculo } from "@/lib/types";
import { actualizarInformeTecnicoAction } from "@/app/(app)/informe-tecnico/editar/[id]/actions";
import { Step1General } from "./step-1-general";
import { Step2Equipo } from "./step-2-equipo";
import type { CatalogosInforme, InformeFormState } from "./types";
import { ErrorNote, SuccessNote } from "@/components/notes";

const STEPS: WizardStep[] = [
  { title: "Información General", sub: "Datos básicos del informe" },
  { title: "Técnicos y Recursos", sub: "Personal, seguridad y vehículos asignados" },
  { title: "Revisión", sub: "Confirmá los cambios y regenerá el PDF" },
];

function fmtFecha(fecha: string) {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function EditarInformeTecnicoWizard({
  informeId,
  numeroGeneracion,
  cantidadFotos,
  initialForm,
  initialTecnicos,
  initialVehiculos,
  catalogos,
  logoUrl,
}: {
  informeId: string;
  numeroGeneracion: string;
  cantidadFotos: number;
  initialForm: InformeFormState;
  initialTecnicos: Tecnico[];
  initialVehiculos: Vehiculo[];
  catalogos: CatalogosInforme;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<InformeFormState>(initialForm);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>(initialTecnicos);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(initialVehiculos);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ pdfUrl: string | null } | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  function patchForm(patch: Partial<InformeFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function validateStep1(): string | null {
    if (!form.titulo.trim()) return "Falta el Título del Informe.";
    if (!form.fecha) return "Falta la Fecha.";
    if (!form.cliente.trim()) return "Falta el Cliente.";
    if (!form.proyecto.trim()) return "Falta el Proyecto.";
    return null;
  }

  function nextStep() {
    if (step === 1) {
      const err = validateStep1();
      if (err) {
        setStepError(err);
        return;
      }
    }
    setStepError(null);
    setStep((s) => Math.min(STEPS.length, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function prevStep() {
    setStepError(null);
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleGuardar() {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("payload", JSON.stringify({ ...form, tecnicos, vehiculos }));
      const result = await actualizarInformeTecnicoAction(informeId, fd);
      if (!result.success) {
        setError(result.error || "No se pudo guardar el informe.");
        return;
      }
      setSuccess({ pdfUrl: result.pdfUrl ?? null });
      router.refresh();
    } catch {
      setError("Ocurrió un error inesperado guardando los cambios.");
    } finally {
      setSubmitting(false);
    }
  }

  const tipoLabel = form.tipoInforme === "__new" ? form.tipoInformeNuevo || "Nuevo tipo sin nombrar" : form.tipoInforme || "—";
  const vehText = vehiculos.length ? vehiculos.map((v) => (v.marcaModelo ? `${v.patente} (${v.marcaModelo})` : v.patente)).join(", ") : "—";
  const seguridad = tecnicos.filter((t) => t.esSeguridad);

  return (
    <div>
      <div className="hint" style={{ marginBottom: 12 }}>
        Editando {numeroGeneracion} — las fotos ya cargadas ({cantidadFotos}) no se tocan acá; si hay que
        cambiar una foto, hay que rehacer el informe.
      </div>
      <Stepper steps={STEPS} current={step} />

      {step === 1 && <Step1General form={form} onChange={patchForm} catalogos={catalogos} logoUrl={logoUrl} />}
      {step === 2 && (
        <Step2Equipo
          tecnicos={tecnicos}
          setTecnicos={setTecnicos}
          vehiculos={vehiculos}
          setVehiculos={setVehiculos}
          catalogos={catalogos}
        />
      )}
      {step === 3 && (
        <div className="card">
          <div className="review-block-title">Datos generales</div>
          <table className="review-table">
            <tbody>
              <tr>
                <td className="k">Título</td>
                <td className="v">{form.titulo || "—"}</td>
              </tr>
              <tr>
                <td className="k">Fecha</td>
                <td className="v">{fmtFecha(form.fecha)}</td>
              </tr>
              <tr>
                <td className="k">Cliente</td>
                <td className="v">{form.cliente || "—"}</td>
              </tr>
              <tr>
                <td className="k">Proyecto</td>
                <td className="v">{form.proyecto || "—"}</td>
              </tr>
              <tr>
                <td className="k">Tipo de Informe</td>
                <td className="v">{tipoLabel}</td>
              </tr>
              <tr>
                <td className="k">Provincia</td>
                <td className="v">{form.provincia || "—"}</td>
              </tr>
              <tr>
                <td className="k">Ubicación</td>
                <td className="v">{form.ubicacion || "—"}</td>
              </tr>
              <tr>
                <td className="k">Personal Afectado</td>
                <td className="v">{tecnicos.length ? tecnicos.map((t) => t.nombre).join(", ") : "—"}</td>
              </tr>
              <tr>
                <td className="k">Técnico Higiene y Seguridad</td>
                <td className="v">{seguridad.length ? `Sí — ${seguridad.map((t) => t.nombre).join(", ")}` : "No"}</td>
              </tr>
              <tr>
                <td className="k">Vehículo(s) Utilizado(s)</td>
                <td className="v">{vehText}</td>
              </tr>
              <tr>
                <td className="k">Fotos (sin cambios)</td>
                <td className="v">{cantidadFotos}</td>
              </tr>
            </tbody>
          </table>

          {error && <ErrorNote>{error}</ErrorNote>}
          {success && (
            <SuccessNote>
              Informe actualizado y PDF regenerado.{" "}
              {success.pdfUrl && (
                <a href={success.pdfUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
                  ver PDF
                </a>
              )}
            </SuccessNote>
          )}
        </div>
      )}

      {stepError && <ErrorNote>{stepError}</ErrorNote>}

      <div className="footer-nav">
        <button
          type="button"
          className="btn btn-secondary"
          style={{ visibility: step === 1 ? "hidden" : "visible" }}
          onClick={prevStep}
          disabled={submitting}
        >
          ← Anterior
        </button>
        {step === STEPS.length ? (
          success ? (
            <button type="button" className="btn btn-primary" onClick={() => router.push("/informe-tecnico/historial")}>
              Ir al historial →
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleGuardar} disabled={submitting}>
              {submitting ? "Guardando..." : "Guardar y regenerar PDF →"}
            </button>
          )
        ) : (
          <button type="button" className="btn btn-primary" onClick={nextStep}>
            Siguiente →
          </button>
        )}
      </div>
    </div>
  );
}
