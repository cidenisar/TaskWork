"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearRendicionAction } from "@/app/(app)/rendicion-gastos/nueva/actions";
import { Step1Datos } from "./step-1-datos";
import { EMPTY_RENDICION_FORM, type RendicionFormState } from "./types";

export function NuevaRendicionForm({ provincias }: { provincias: string[] }) {
  const router = useRouter();
  const [form, setForm] = useState<RendicionFormState>(EMPTY_RENDICION_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchForm(patch: Partial<RendicionFormState>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function crear() {
    if (!form.motivo.trim() || !form.fecha || !form.viaticoRecibido.trim()) {
      setError("Completá motivo, fecha y viático recibido.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await crearRendicionAction(form);
    setSubmitting(false);
    if (!res.success || !res.rendicionId) {
      setError(res.error || "No se pudo crear la rendición.");
      return;
    }
    router.push(`/rendicion-gastos/${res.rendicionId}`);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Nueva Rendición</h1>
        <p>
          Cargá el viático y los datos generales del viaje — después vas a poder ir agregando gastos de a
          uno, cuando quieras, hasta que hagas el cierre.
        </p>
      </div>
      <Step1Datos form={form} onChange={patchForm} catalogos={{ provincias, categoriasGasto: [], tecnicos: [], torres: [] }} />
      {error && <div className="error-note">⚠️ {error}</div>}
      <div className="footer-nav">
        <span />
        <button type="button" className="btn btn-primary" onClick={crear} disabled={submitting}>
          {submitting ? "Creando..." : "Crear y empezar a cargar gastos →"}
        </button>
      </div>
    </div>
  );
}
