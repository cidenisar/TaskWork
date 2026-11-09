import Link from "next/link";
import { requirePanelAccess } from "@/lib/auth";
import { Icon } from "@/components/icon";
import { PanelNav } from "@/components/panel/panel-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import "./panel.css";

/**
 * Shell propio del Panel de Supervisión — a propósito NO usa <AppShell>
 * (el shell mobile-first del resto de la app): esta sección es para
 * pantalla grande, con sidebar fija y grilla densa en vez de tarjetas
 * apiladas a 800px. Admin/Supervisor entran a todo; un técnico también
 * puede entrar pero limitado (ver puedeVerPanel y PanelNav) — nunca a
 * Estadísticas ni Configuración, que mantienen su propio gate más estricto.
 */
export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const profile = await requirePanelAccess();

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
        <PanelNav esAdminOSupervisor={profile.rol !== "tecnico"} />
        <div className="panel-sidebar-footer">
          <ThemeToggle className="panel-nav-item" />
          <Link href="/" className="panel-nav-item">
            <Icon name="arrow-left" size={14} /> Volver a la app
          </Link>
        </div>
      </aside>
      <main className="panel-main">{children}</main>
    </div>
  );
}
