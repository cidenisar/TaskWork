import Link from "next/link";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { Icon } from "@/components/icon";
import { PanelNav } from "@/components/panel/panel-nav";
import "./panel.css";

/**
 * Shell propio del Panel de Supervisión — a propósito NO usa <AppShell>
 * (el shell mobile-first del resto de la app): esta sección es para
 * Admin/Supervisor en una pantalla grande, con sidebar fija y grilla densa
 * en vez de tarjetas apiladas a 800px. Mismo gate que Estadísticas
 * (Admin/Supervisor), reforzado acá además de RLS.
 */
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  await requireAdminOrSupervisor();

  return (
    <div className="panel-shell">
      <aside className="panel-sidebar">
        <div className="panel-brand">
          <div className="panel-brand-ico">
            <Icon name="building" size={16} />
          </div>
          <div>
            <div className="panel-brand-title">Panel</div>
            <div className="panel-brand-sub">Supervisión</div>
          </div>
        </div>
        <PanelNav />
        <div className="panel-sidebar-footer">
          <Link href="/" className="panel-nav-item">
            <Icon name="arrow-left" size={14} /> Volver a la app
          </Link>
        </div>
      </aside>
      <main className="panel-main">{children}</main>
    </div>
  );
}
