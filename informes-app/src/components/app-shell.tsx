"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { ROL_LABEL, puedeVerConfiguracion } from "@/lib/types";
import { signOutAction } from "@/app/login/actions";
import { Icon } from "@/components/icon";

interface NavTab {
  href: string;
  label: string;
  gated?: boolean;
}

interface GroupOption {
  href: string;
  label: string;
}

interface ModuleConfig {
  brand: string;
  tabs: NavTab[];
  /** Para módulos anidados bajo un hub (ej. Relevamiento de Equipos): a dónde vuelve "Volver". */
  backHref?: string;
  /** Selector de tipo de equipo (Tableros / Comunicaciones / ...) para moverse entre hermanos sin pasar por el hub. */
  group?: GroupOption[];
}

// Un solo lugar para los tipos de "Relevamiento de Equipos" — sumar un tipo
// nuevo es agregar una entrada acá y en el hub /relevamiento (Equipos
// Individuales ya cubre UPS/cámaras/etc. sin necesitar una entrada propia
// por cada uno — ver src/components/equipos).
const RELEVAMIENTO_GROUP: GroupOption[] = [
  { href: "/tableros/nuevo", label: "Tableros" },
  { href: "/racks/nuevo", label: "Comunicaciones" },
  { href: "/equipos/nuevo", label: "Equipos Individuales" },
];

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
  relevamiento: {
    brand: "Relevamiento de Equipos",
    tabs: [],
  },
  tableros: {
    brand: "Relevamiento de Equipos",
    backHref: "/relevamiento",
    group: RELEVAMIENTO_GROUP,
    tabs: [
      { href: "/tableros/nuevo", label: "Nueva Medición" },
      { href: "/tableros/mantenimiento", label: "Mantenimiento" },
      { href: "/tableros/historial", label: "Historial" },
    ],
  },
  racks: {
    brand: "Relevamiento de Equipos",
    backHref: "/relevamiento",
    group: RELEVAMIENTO_GROUP,
    tabs: [
      { href: "/racks/nuevo", label: "Nuevo Relevamiento" },
      { href: "/racks/historial", label: "Historial" },
    ],
  },
  equipos: {
    brand: "Relevamiento de Equipos",
    backHref: "/relevamiento",
    group: RELEVAMIENTO_GROUP,
    tabs: [
      { href: "/equipos/nuevo", label: "Nuevo Relevamiento" },
      { href: "/equipos/historial", label: "Historial" },
    ],
  },
  ubicaciones: {
    brand: "Sitios",
    tabs: [{ href: "/ubicaciones", label: "Todos los Sitios" }],
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
  const backHref = moduleConfig?.backHref ?? "/";
  const backLabel = moduleConfig?.backHref ? "Volver a Relevamiento de Equipos" : "Volver al inicio";

  return (
    <div className={moduleKey === "estadisticas" ? "app app-wide" : "app"}>
      <div className="topbar">
        {!isHome ? (
          <Link href={backHref} className="back">
            <Icon name="arrow-left" size={13} /> {backLabel}
          </Link>
        ) : (
          <span />
        )}
        <div className="brand">{brand}</div>
      </div>

      <div className="sessionbar">
        <div className="who">
          {profile.fotoPerfilUrl ? (
            // Cuadrado + object-fit:contain, igual criterio que en Mi cuenta —
            // se ve la foto entera, nunca recortada.
            // eslint-disable-next-line @next/next/no-img-element -- avatar chico, no vale la pena next/image acá
            <img
              src={profile.fotoPerfilUrl}
              alt=""
              className="avatar"
              style={{ width: 44, height: 44, borderRadius: 10, objectFit: "contain", background: "var(--panel-2)" }}
            />
          ) : (
            <div className="avatar" style={{ width: 44, height: 44, borderRadius: 10, fontSize: 17 }}>
              {(profile.nombreCompleto[0] || "?").toUpperCase()}
            </div>
          )}
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

      {moduleConfig?.group && (
        <div className="grouptabs">
          {moduleConfig.group.map((opt) => {
            const active = pathname.startsWith(opt.href.split("/").slice(0, 2).join("/"));
            return (
              <Link key={opt.href} href={opt.href} className={`grouptab${active ? " active" : ""}`}>
                {opt.label}
              </Link>
            );
          })}
        </div>
      )}

      {moduleConfig && moduleConfig.tabs.length > 0 && (
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
                {locked && (
                  <span className="lock">
                    <Icon name="lock" size={11} />
                  </span>
                )}
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
