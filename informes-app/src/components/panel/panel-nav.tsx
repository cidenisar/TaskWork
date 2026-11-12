"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/panel", label: "Vista general", icon: "building" },
  { href: "/panel/mapa", label: "Mapa", icon: "map" },
  { href: "/panel/mantenimientos", label: "Mantenimientos", icon: "wrench" },
  { href: "/panel/vehiculos", label: "Vehículos", icon: "truck" },
  { href: "/panel/planos-qr", label: "Planos y QR", icon: "document" },
  { href: "/panel/materiales", label: "Materiales", icon: "search" },
  { href: "/panel/riesgo-viaje", label: "Riesgo de Viaje", icon: "warning" },
];

/** Solo Admin/Supervisor/Superusuario — un técnico con acceso limitado al Panel no entra acá (ver puedeVerPanel). Guardia General vive acá y no en Configuración porque Configuración excluye a Supervisor y HANDOFF le da estas pantallas también a Supervisor. */
const ITEMS_ADMIN_SUPERVISOR: { href: string; label: string; icon: IconName }[] = [
  { href: "/panel/guardia", label: "Guardia General", icon: "bell" },
  { href: "/estadisticas", label: "Estadísticas", icon: "chart" },
  { href: "/configuracion", label: "Configuración", icon: "settings" },
];

export function PanelNav({ esAdminOSupervisor }: { esAdminOSupervisor: boolean }) {
  const pathname = usePathname();
  const items = esAdminOSupervisor ? [...ITEMS, ...ITEMS_ADMIN_SUPERVISOR] : ITEMS;
  return (
    <nav className="panel-nav mz-nav" aria-label="Secciones del Panel">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`panel-nav-item mz-nav-item${pathname === item.href ? " active on" : ""}`}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          <Icon name={item.icon} size={16} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
