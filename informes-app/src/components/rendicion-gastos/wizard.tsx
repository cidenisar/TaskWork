"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper, type WizardStep } from "@/components/ui/stepper";
import { crearRendicionGastosAction } from "@/app/(app)/rendicion-gastos/nueva/actions";
import { nuevoNumeroGeneracionRendicion } from "@/lib/rendicion-gastos/numero-generacion";
import { Step1Datos } from "./step-1-datos";
import { Step2Gastos } from "./step-2-gastos";
import { Step3Resumen } from "./step-3-resumen";
import { EMPTY_RENDICION_FORM, type CatalogosRendicion, type GastoItem, type RendicionFormState } from "./types";

const STEPS: WizardStep[] = [
  { title: "Datos de la Rendición", sub: "Viático recibido y datos generales" },
  { title: "Agregar Gastos", sub: "Cargá cada gasto con su comprobante" },
  { title: "Resumen", sub: "Confirmá los datos y generá el PDF / Excel" },
];

export function RendicionGastosWizard({ catalogos }: { catalogos: CatalogosRendicion }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<RendicionFormState>(EMPTY_RENDICION_FORM);
  const [gastos, setGastos] = useState<GastoItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ numeroGeneracion: string; pdfUrl: string | null } | null>(null);
  const [rendicionId, setRendicionId] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const numeroGeneracion = useMemo(() => nuevoNumeroGeneracionRendicion(), []);

  function patchForm(patch: Partial<RendicionFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  function validateStep1(): string | null {
    if (!form.motivo.trim()) return "Falta el Motivo / Título.";
    if (!form.fecha) return "Falta la Fecha.";
    if (!form.viaticoRecibido.trim() || Number(form.viaticoRecibido.replace(",", ".")) < 0) {
      return "Falta el Viático Recibido.";
    }
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

  async function persistirRendicion(): Promise<{ id: string; pdfUrl: string | null } | null> {
    if (rendicionId) return { id: rendicionId, pdfUrl: success?.pdfUrl ?? null };
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          ...form,
          gastos: gastos.map((g) => ({
            fecha: g.fecha,
            categoria: g.categoria,
            monto: g.monto,
            descripcion: g.descripcion,
            tecnicos: g.tecnicos,
          })),
          numeroGeneracionPreferido: numeroGeneracion,
        }),
      );
      gastos.forEach((g, i) => {
        if (g.comprobanteBlob) fd.append(`comprobante_${i}`, g.comprobanteBlob, `comprobante-${i}.jpg`);
      });

      const result = await crearRendicionGastosAction(fd);
      if (!result.success || !result.rendicionId) {
        setError(result.error || "No se pudo generar la rendición.");
        return null;
      }
      setRendicionId(result.rendicionId);
      setSuccess({ numeroGeneracion: result.numeroGeneracion!, pdfUrl: result.pdfUrl ?? null });
      router.refresh();
      return { id: result.rendicionId, pdfUrl: result.pdfUrl ?? null };
    } catch {
      setError("Ocurrió un error inesperado generando la rendición.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerarPdf() {
    const res = await persistirRendicion();
    if (res?.pdfUrl) window.open(res.pdfUrl, "_blank", "noopener,noreferrer");
  }
  async function handleExportarExcel() {
    const res = await persistirRendicion();
    if (res) window.open(`/api/rendiciones/${res.id}/excel`, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <Stepper steps={STEPS} current={step} />

      {step === 1 && <Step1Datos form={form} onChange={patchForm} catalogos={catalogos} />}
      {step === 2 && <Step2Gastos gastos={gastos} setGastos={setGastos} catalogos={catalogos} />}
      {step === 3 && (
        <Step3Resumen
          numeroGeneracion={numeroGeneracion}
          form={form}
          gastos={gastos}
          submitting={submitting}
          error={error}
          success={success}
          onGenerarPdf={handleGenerarPdf}
          onExportarExcel={handleExportarExcel}
        />
      )}

      {stepError && <div className="error-note">⚠️ {stepError}</div>}

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
          success && (
            <button type="button" className="btn btn-primary" onClick={() => router.push("/rendicion-gastos/historial")}>
              Ir al historial →
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
