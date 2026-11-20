"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { asumirGuardiaSemanalAction } from "@/app/(app)/guardia/actions";
import type { AreaGuardia } from "@/lib/guardia/cronograma";
import { Icon } from "@/components/icon";

export function AsuncionSemanal({ semanaInicio, area }: { semanaInicio: string; area: AreaGuardia }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function asumir() {
    setBusy(true);
    setError(null);
    const res = await asumirGuardiaSemanalAction(semanaInicio, area);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo confirmar.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-label">Asumís la guardia de {area}</div>
      <p className="empty-note">Semana desde el miércoles {semanaInicio}.</p>
      {error && <div className="error-text">{error}</div>}
      <button type="button" className="btn btn-primary btn-sm" onClick={asumir} disabled={busy}>
        <Icon name="check" size={13} /> {busy ? "Confirmando..." : "Asumo la guardia"}
      </button>
    </div>
  );
}
