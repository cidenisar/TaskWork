"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/panel", label: "Vista general", icon: "building" },
  { href: "/estadisticas", label: "Estadísticas", icon: "chart" },
];

export function PanelNav() {
  const pathname = usePathname();
  return (
    <nav className="panel-nav">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={`panel-nav-item${pathname === item.href ? " active" : ""}`}>
          <span className="panel-nav-dot" />
          <Icon name={item.icon} size={14} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
