import { EmpresaCard } from "./empresa";
import { EmailsCard, type EmailRow } from "./emails";
import { CatalogosCard, type CatalogosData } from "./catalogos-card";
import { HistorialAlmacenamientoCard } from "./historial-almacenamiento";
import { ResumenSemanalCard } from "./resumen-semanal";
import { AuditLogCard, type AuditLogRow } from "./audit-log";
import type { UmbralAviso } from "@/lib/database.types";

export interface ConfiguracionViewData {
  logoUrl: string | null;
  autoEnviarEmail: boolean;
  emails: EmailRow[];
  catalogos: CatalogosData;
  umbralAviso: UmbralAviso;
  recordatorioSemanal: boolean;
  resumenSemanalIa: boolean;
  auditLog: AuditLogRow[];
}

export function ConfiguracionView({ data }: { data: ConfiguracionViewData }) {
  return (
    <div>
      <div className="page-heading">
        <h1>Configuración</h1>
        <p>Envío por email, catálogos reutilizables y almacenamiento</p>
      </div>

      <EmpresaCard logoUrl={data.logoUrl} />
      <EmailsCard autoEnviar={data.autoEnviarEmail} emails={data.emails} />
      <CatalogosCard data={data.catalogos} />
      <HistorialAlmacenamientoCard umbral={data.umbralAviso} recordatorio={data.recordatorioSemanal} />
      <ResumenSemanalCard activo={data.resumenSemanalIa} />
      <AuditLogCard rows={data.auditLog} />
    </div>
  );
}
