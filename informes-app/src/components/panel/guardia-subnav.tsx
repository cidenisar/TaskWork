"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/panel/guardia", label: "Resumen" },
  { href: "/panel/guardia/personas", label: "Personas" },
  { href: "/panel/guardia/parametros", label: "Parámetros" },
  { href: "/panel/guardia/calendario", label: "Calendario" },
  { href: "/panel/guardia/cronograma", label: "Cronograma" },
  { href: "/panel/guardia/liquidacion", label: "Liquidación" },
  { href: "/panel/guardia/avisos", label: "Avisos" },
];

export function GuardiaSubnav() {
  const pathname = usePathname();
  return (
    <div className="navtabs" style={{ marginBottom: 20 }}>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`navtab${pathname === t.href ? " active" : ""}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
