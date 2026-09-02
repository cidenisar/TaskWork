"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { ROL_LABEL, puedeVerConfiguracion } from "@/lib/types";
import { signOutAction } from "@/app/login/actions";

interface NavTab {
  href: string;
  label: string;
  gated?: boolean;
}

interface ModuleConfig {
  brand: string;
  tabs: NavTab[];
}

const NAV_CONFIG: Record<string, ModuleConfig> = {
  "informe-tecnico": {
    brand: "Informe Técnico",
    tabs: [
      { href: "/informe-tecnico/nuevo", label: "Nuevo Informe" },
      { href: "/informe-tecnico/historial", label: "Historial" },
    ],
  },
  "rendicion-gastos": {
    brand: "Rendición de Gastos",
    tabs: [
      { href: "/rendicion-gastos/nueva", label: "Nueva Rendición" },
      { href: "/rendicion-gastos/historial", label: "Historial" },
    ],
  },
  estadisticas: {
    brand: "Estadísticas",
    tabs: [
      { href: "/estadisticas", label: "Resumen" },
      { href: "/configuracion", label: "Configuración", gated: true },
    ],
  },
};

function moduleKeyFor(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;
  if (seg === "configuracion") return null;
  return seg in NAV_CONFIG ? seg : null;
}

export function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const moduleKey = moduleKeyFor(pathname);
  const moduleConfig = moduleKey ? NAV_CONFIG[moduleKey] : null;
  const isHome = pathname === "/";
  const brand = moduleConfig?.brand ?? (pathname === "/configuracion" ? "Configuración" : "Informes");

  return (
    <div className="app">
      <div className="topbar">
        {!isHome ? (
          <Link href="/" className="back">
            ← Volver al inicio
          </Link>
        ) : (
          <span />
        )}
        <div className="brand">{brand}</div>
      </div>

      <div className="sessionbar">
        <div className="who">
          <span>{profile.nombreCompleto}</span>
          <span className="role-pill">{ROL_LABEL[profile.rol]}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href="/cuenta" className="signout" style={{ textDecoration: "none" }}>
            Mi cuenta
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="signout">
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      {moduleConfig && (
        <div className="navtabs">
          {moduleConfig.tabs.map((tab) => {
            const locked = tab.gated && !puedeVerConfiguracion(profile.rol);
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`navtab${active ? " active" : ""}${locked ? " locked" : ""}`}
              >
                {tab.label}
                {locked && <span className="lock">🔒</span>}
              </Link>
            );
          })}
        </div>
      )}

      <main>{children}</main>

      <div className="wire-note">Informes — Informe Técnico &amp; Rendición de Gastos</div>
    </div>
  );
}
