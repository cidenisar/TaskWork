import Link from "next/link";
import { requirePanelAccess } from "@/lib/auth";
import { Icon } from "@/components/icon";
import { PanelNav } from "@/components/panel/panel-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { ROL_LABEL } from "@/lib/types";
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
    <div className="panel-shell mz-page">
      {/* Imagen "Mezcla" (10/11/2026): la barra lateral pasó a ser una banda azul arriba, a
          todo el ancho, con las secciones del Panel en fila (se deslizan de costado si no
          entran). Misma estructura que la barra de la app, para que se sienta una sola. */}
      <header className="mz-header">
        <div className="mz-header-inner mz-full">
          <Link href="/panel" className="mz-brand" aria-label="Panel de Supervisión">
            <span className="mz-brand-ico">
              <Icon name="building" size={20} />
            </span>
            <span className="mz-brand-txt">
              <strong>Panel</strong>
              <span>Supervisión</span>
            </span>
          </Link>
          <PanelNav esAdminOSupervisor={profile.rol !== "tecnico"} />
          <div className="mz-actions">
            <ThemeToggle className="mz-icbtn" soloIcono />
            <Link href="/" className="mz-icbtn" title="Volver a la app" aria-label="Volver a la app">
              <Icon name="home" size={19} />
              <span className="mz-lbl">App</span>
            </Link>
            <Link href="/cuenta" className="mz-who" title="Mi cuenta">
              <span className="mz-avatar">{(profile.nombreCompleto[0] || "?").toUpperCase()}</span>
              <span className="mz-who-txt">
                <span className="mz-who-name">{profile.nombreCompleto}</span>
                <span className="mz-who-rol">{ROL_LABEL[profile.rol]}</span>
              </span>
            </Link>
          </div>
        </div>
      </header>
      <main className="panel-main">{children}</main>
    </div>
  );
}
