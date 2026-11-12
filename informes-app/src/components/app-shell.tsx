"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { ROL_LABEL, puedeVerConfiguracion } from "@/lib/types";
import { signOutAction } from "@/app/login/actions";
import { Icon, type IconName } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";

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
  { href: "/torres-comunicacion/nuevo", label: "Torres de Comunicaciones" },
  { href: "/equipos/nuevo", label: "Equipos Individuales" },
  { href: "/salas/nuevo", label: "Salas / Shelters" },
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
  "torres-comunicacion": {
    brand: "Relevamiento de Equipos",
    backHref: "/relevamiento",
    group: RELEVAMIENTO_GROUP,
    tabs: [
      { href: "/torres-comunicacion/nuevo", label: "Nuevo Relevamiento" },
      { href: "/torres-comunicacion/historial", label: "Historial" },
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
  salas: {
    brand: "Relevamiento de Equipos",
    backHref: "/relevamiento",
    group: RELEVAMIENTO_GROUP,
    tabs: [
      { href: "/salas/nuevo", label: "Nueva Sala" },
      { href: "/salas/historial", label: "Historial" },
    ],
  },
  ubicaciones: {
    brand: "Sitios",
    tabs: [{ href: "/ubicaciones", label: "Todos los Sitios" }],
  },
  "escanear-qr": {
    brand: "Escanear QR",
    tabs: [],
  },
  bajas: {
    brand: "Bajas de Equipamiento",
    tabs: [{ href: "/bajas/historial", label: "Historial" }],
  },
  "entregas-deposito": {
    brand: "Entregas a Depósito",
    tabs: [
      { href: "/entregas-deposito/nueva", label: "Nueva Entrega" },
      { href: "/entregas-deposito/historial", label: "Historial" },
    ],
  },
  "riesgo-viaje": {
    brand: "Riesgo de Viaje",
    tabs: [
      { href: "/riesgo-viaje/nueva", label: "Nueva Evaluación" },
      { href: "/riesgo-viaje/historial", label: "Historial" },
    ],
  },
  "control-vehiculo": {
    brand: "Control de Vehículo",
    tabs: [
      { href: "/control-vehiculo/nuevo", label: "Nuevo Control" },
      { href: "/control-vehiculo/historial", label: "Historial" },
    ],
  },
  estadisticas: {
    brand: "Estadísticas",
    tabs: [{ href: "/estadisticas", label: "Resumen" }],
  },
  ayuda: {
    brand: "Ayuda",
    tabs: [],
  },
  guardia: {
    brand: "Guardia General",
    tabs: [
      { href: "/guardia", label: "Mi guardia" },
      { href: "/guardia/horas", label: "Mis horas" },
      { href: "/guardia/historial", label: "Historial" },
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
  // Configuración vive entera bajo /configuracion/* pero son subrutas, no
  // un moduleKey (moduleKeyFor la excluye a propósito) — se trata aparte en
  // vez de sumar un NAV_CONFIG por sección: el hub vuelve al Panel (es la
  // única puerta de entrada ahora, ver PanelNav) y cada subpágina vuelve al
  // hub, un nivel por vez, mismo criterio que "Volver a Relevamiento".
  const esConfigHub = pathname === "/configuracion";
  const esConfigSubpagina = pathname.startsWith("/configuracion/");
  const brand = moduleConfig?.brand ?? (esConfigHub || esConfigSubpagina ? "Configuración" : "TaskWork");
  const backHref = moduleConfig?.backHref ?? (esConfigHub ? "/panel" : esConfigSubpagina ? "/configuracion" : "/");
  const backLabel = moduleConfig?.backHref
    ? "Volver a Relevamiento de Equipos"
    : esConfigHub
      ? "Volver al Panel"
      : esConfigSubpagina
        ? "Volver a Configuración"
        : "Volver al inicio";
  // Pantallas con mucho dato para visualizar (listas largas, tablas) — en
  // pantalla ancha usan .app-wide en vez de los 800px fijos de siempre. Los
  // historiales entran por ruta, no por módulo entero: las pantallas de
  // carga (nuevo/mantenimiento) del mismo módulo son formularios angostos,
  // no se benefician de más ancho.
  const anchoCompleto = moduleKey === "estadisticas" || moduleKey === "ubicaciones" || pathname.endsWith("/historial") || esConfigSubpagina;

  return (
    <div className="mz-page">
      {/* Barra superior de la imagen "Mezcla": banda azul a todo el ancho con la marca, las
          pestañas del módulo y las acciones de sesión. En el celular las pestañas bajan a una
          segunda fila que se desliza de costado. */}
      <header className="mz-header">
        <div className={anchoCompleto ? "mz-header-inner mz-wide" : "mz-header-inner"}>
          <Link href="/" className="mz-brand" aria-label="TaskWork — inicio">
            <span className="mz-brand-ico">
              <Icon name="document" size={21} />
            </span>
            <span className="mz-brand-txt">
              <strong>{brand}</strong>
              <span>{brand === "TaskWork" ? "Informes y rendiciones" : "TaskWork"}</span>
            </span>
          </Link>

          {moduleConfig && moduleConfig.tabs.length > 0 && (
            <nav className="mz-nav" aria-label="Secciones del módulo">
              {moduleConfig.tabs.map((tab) => {
                const locked = tab.gated && !puedeVerConfiguracion(profile.rol);
                const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`mz-nav-item${active ? " on" : ""}${locked ? " locked" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon name={iconoDePestana(tab.label)} size={17} />
                    {tab.label}
                    {locked && <Icon name="lock" size={12} />}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="mz-actions">
            <ThemeToggle className="mz-icbtn" soloIcono />
            <Link href="/ayuda" className="mz-icbtn" title="Ayuda" aria-label="Ayuda">
              <Icon name="help" size={19} />
              <span className="mz-lbl">Ayuda</span>
            </Link>
            <Link href="/cuenta" className="mz-who" title="Mi cuenta">
              {profile.fotoPerfilUrl ? (
                // Cuadrado + object-fit:contain, igual criterio que en Mi cuenta —
                // se ve la foto entera, nunca recortada.
                // eslint-disable-next-line @next/next/no-img-element -- avatar chico, no vale la pena next/image acá
                <img src={profile.fotoPerfilUrl} alt="" className="mz-avatar" style={{ objectFit: "contain" }} />
              ) : (
                <span className="mz-avatar">{(profile.nombreCompleto[0] || "?").toUpperCase()}</span>
              )}
              <span className="mz-who-txt">
                <span className="mz-who-name">{profile.nombreCompleto}</span>
                <span className="mz-who-rol">{ROL_LABEL[profile.rol]}</span>
              </span>
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="mz-icbtn" title="Cerrar sesión" aria-label="Cerrar sesión">
                <Icon name="log-out" size={19} />
                <span className="mz-lbl">Salir</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className={anchoCompleto ? "app app-wide" : "app"}>
        {!isHome && (
          <Link href={backHref} className="back mz-back">
            <Icon name="arrow-left" size={14} /> {backLabel}
          </Link>
        )}

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

        <main>{children}</main>

        <div className="wire-note">TaskWork — Informe Técnico &amp; Rendición de Gastos</div>
      </div>
    </div>
  );
}

/** Ícono de cada pestaña según su nombre — las pestañas se definen arriba solo con texto. */
function iconoDePestana(label: string): IconName {
  const l = label.toLowerCase();
  if (l.startsWith("nuev")) return "plus";
  if (l.includes("historial")) return "clock";
  if (l.includes("mantenimiento")) return "wrench";
  if (l.includes("resumen")) return "chart";
  if (l.includes("sitios")) return "map";
  if (l.includes("guardia")) return "bell";
  return "document";
}
