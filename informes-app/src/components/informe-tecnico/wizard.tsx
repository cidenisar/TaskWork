"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper, type WizardStep } from "@/components/ui/stepper";
import type { ImagenInforme, Tecnico, Vehiculo } from "@/lib/types";
import { crearInformeTecnicoAction } from "@/app/(app)/informe-tecnico/nuevo/actions";
import { nuevoNumeroGeneracionInforme } from "@/lib/informe-tecnico/numero-generacion";
import { Step1General } from "./step-1-general";
import { Step2Equipo } from "./step-2-equipo";
import { Step3Imagenes } from "./step-3-imagenes";
import { Step4Revision } from "./step-4-revision";
import { EMPTY_FORM, type CatalogosInforme, type EmailDestinatario, type InformeFormState } from "./types";

const STEPS: WizardStep[] = [
  { title: "Información General", sub: "Datos básicos del informe" },
  { title: "Técnicos y Recursos", sub: "Personal, seguridad y vehículos asignados" },
  { title: "Imágenes", sub: "Documentación visual" },
  { title: "Revisión", sub: "Confirmá los datos antes de generar el PDF" },
];

export function InformeTecnicoWizard({
  catalogos,
  logoUrl,
  emails,
}: {
  catalogos: CatalogosInforme;
  logoUrl: string | null;
  emails: EmailDestinatario[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<InformeFormState>(EMPTY_FORM);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [imagenes, setImagenes] = useState<ImagenInforme[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(
    () => new Set(emails.filter((e) => e.activo).map((e) => e.email)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ numeroGeneracion: string; pdfUrl: string | null } | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const numeroGeneracion = useMemo(() => nuevoNumeroGeneracionInforme(), []);

  function patchForm(patch: Partial<InformeFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }
  function toggleEmail(email: string) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
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

  async function handleGenerar() {
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          ...form,
          tecnicos,
          vehiculos,
          imagenes: imagenes.map((i) => ({ lat: i.lat, lon: i.lon, accuracyM: i.accuracyM, tomadaEn: i.tomadaEn })),
          emailsSeleccionados: Array.from(selectedEmails),
          numeroGeneracionPreferido: numeroGeneracion,
        }),
      );
      imagenes.forEach((img, i) => fd.append(`imagen_${i}`, img.blob, `foto-${i}.jpg`));

      const result = await crearInformeTecnicoAction(fd);
      if (!result.success) {
        setError(result.error || "No se pudo generar el informe.");
        return;
      }
      setSuccess({ numeroGeneracion: result.numeroGeneracion!, pdfUrl: result.pdfUrl ?? null });
      router.refresh();
    } catch {
      setError("Ocurrió un error inesperado generando el informe.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
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
      {step === 3 && <Step3Imagenes imagenes={imagenes} setImagenes={setImagenes} />}
      {step === 4 && (
        <Step4Revision
          numeroGeneracion={numeroGeneracion}
          form={form}
          tecnicos={tecnicos}
          vehiculos={vehiculos}
          imagenes={imagenes}
          emails={emails}
          selectedEmails={selectedEmails}
          onToggleEmail={toggleEmail}
          submitting={submitting}
          error={error}
          success={success}
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
          success ? (
            <button type="button" className="btn btn-primary" onClick={() => router.push("/informe-tecnico/historial")}>
              Ir al historial →
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleGenerar} disabled={submitting}>
              {submitting ? "Generando..." : "Generar PDF →"}
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
