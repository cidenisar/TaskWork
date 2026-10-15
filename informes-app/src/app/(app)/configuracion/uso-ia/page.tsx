import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { getResumenUsoIa } from "@/lib/ai/obtener-uso";
import { BarList } from "@/components/estadisticas/bar-list";

const MODULO_LABEL: Record<string, string> = {
  tableros: "Tableros",
  racks: "Racks",
  torres: "Torres de Comunicaciones",
  equipos: "Equipos Individuales",
  salas: "Salas",
  "entregas-deposito": "Entregas a Depósito",
  "informe-tecnico": "Informe Técnico",
  vehiculos: "Vehículos",
  estadisticas: "Estadísticas",
  ubicaciones: "Ubicaciones (GPS)",
  "mejorar-texto": "Mejorar texto con IA",
};

function fmtUsd(valor: number): string {
  return `US$ ${valor.toFixed(valor < 10 ? 3 : 2)}`;
}

export default async function ConfiguracionUsoIaPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return <LockedPanel title="Solo para administradores" description="Pedile acceso a tu responsable si necesitás ver el gasto de IA." />;
  }

  const supabase = await createClient();
  const resumen = await getResumenUsoIa(supabase);

  return (
    <div>
      <div className="page-heading">
        <h1>Uso de IA</h1>
        <p>Gasto estimado a partir del consumo real de tokens — para el monto exacto, ver console.anthropic.com → Usage and Cost.</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{fmtUsd(resumen.costoHoyUsd)}</div>
          <div className="kpi-label">Hoy (estimado)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{fmtUsd(resumen.costoUltimos7DiasUsd)}</div>
          <div className="kpi-label">Últimos 7 días</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{fmtUsd(resumen.costoUltimos30DiasUsd)}</div>
          <div className="kpi-label">Últimos 30 días</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{resumen.llamadasUltimos30Dias}</div>
          <div className="kpi-label">Llamadas (30 días)</div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Gasto estimado por módulo (últimos 30 días)</div>
        <BarList
          items={resumen.porModulo.map((m) => ({
            label: MODULO_LABEL[m.modulo] ?? m.modulo,
            value: m.costoUsd,
            displayValue: `${fmtUsd(m.costoUsd)} · ${m.llamadas} llamada${m.llamadas === 1 ? "" : "s"}`,
          }))}
        />
      </div>

      <div className="card">
        <div className="section-label">Cómo se calcula</div>
        <p className="hint" style={{ margin: 0 }}>
          Cada llamada a la IA guarda el consumo real que devuelve la API (tokens de entrada y de salida), multiplicado por el precio de
          lista del modelo usado. Es una estimación útil para ver la tendencia y qué módulo pesa más — el gasto exacto facturado siempre
          está en la consola de Anthropic, nunca acá.
        </p>
      </div>
    </div>
  );
}
