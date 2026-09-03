/**
 * Sistema de íconos de línea propio — reemplaza los emoji sueltos que había
 * por toda la app (🔒✏️⬇🔍🤖✨🎤📷... ver commit que agregó este archivo).
 * Un solo trazo (1.75), esquinas redondeadas, `currentColor` — hereda el
 * color del texto/badge donde se use en vez de traer su propio color como
 * hacía cada emoji, así se ve como un sistema y no como dibujos sueltos.
 */

const PATHS: Record<string, React.ReactNode> = {
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L18.5 9.5a1.5 1.5 0 0 0 0-2.12l-1.88-1.88a1.5 1.5 0 0 0-2.12 0L4 15v5Z" />
      <path d="m13 5.5 3 3" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5L16.5 11" />
      <path d="M4.5 18h15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 19V8" />
      <path d="m7.5 12.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 19h15" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m19 19-4.35-4.35" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2.5h-15L6 16Z" />
      <path d="M10 19.5a2 2 0 0 0 4 0" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  wrench: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0-5.4 4.86L4 16.5V20h3.5l5.14-5.14A4 4 0 0 0 17.5 9.5" />
      <path d="m14.5 6.5 3-1 1 1-1 3-3 1-1-1Z" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19.5 7" />,
  x: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10.5v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </>
  ),
  truck: (
    <>
      <rect x="2.5" y="8" width="11" height="8" rx="1.2" />
      <path d="M13.5 11h3.3l3.2 3v2H20" />
      <circle cx="6.5" cy="17.3" r="1.6" />
      <circle cx="16" cy="17.3" r="1.6" />
    </>
  ),
  document: (
    <>
      <path d="M7 3.5h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 13h6M9 16.5h6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10" />
      <path d="M11 20V4" />
      <path d="M18 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4v-10Z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  map: (
    <>
      <path d="M12 21s6.5-6.1 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.9 6.5 11 6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  building: (
    <>
      <rect x="5" y="3.5" width="10" height="17" rx="1" />
      <path d="M15 10h4v10.5H5" />
      <path d="M8 7h1M11.5 7h1M8 10.5h1M11.5 10.5h1M8 14h1M11.5 14h1" />
    </>
  ),
  note: (
    <>
      <path d="M6 3.5h9l3 3v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path d="m9.5 13 1.8 1.8 3.7-4" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4.5 6.5 7.5 6.5 7.5-6.5" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.9V16h5v-.2c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3Z" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
      <path d="m7 7 1.6 1.6M15.4 15.4 17 17M17 7l-1.6 1.6M8.6 15.4 7 17" />
    </>
  ),
  ai: (
    <>
      <rect x="5" y="7" width="14" height="11" rx="3" />
      <circle cx="9.5" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="12.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 7V4M9 4h6" />
    </>
  ),
  money: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 9.7c0-1.2 1-1.7 2.5-1.7s2.5.6 2.5 1.6c0 2.2-5 1-5 3.2 0 1 1 1.7 2.5 1.7s2.5-.5 2.5-1.7" />
    </>
  ),
  vest: (
    <>
      <path d="M8 4h2l2 2 2-2h2l3 3-2 2v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9L4 7l3-3Z" />
      <path d="M10 6v14M14 6v14" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18M7 21h10" />
      <path d="M4 7h6M14 7h6" />
      <path d="M4 7 1.5 12a2.5 2.5 0 0 0 5 0L4 7ZM20 7l-2.5 5a2.5 2.5 0 0 0 5 0L20 7Z" />
    </>
  ),
  "arrow-left": <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  "arrow-right": <path d="M5 12h14m0 0-6-6m6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, style, className }: { name: IconName; size?: number; style?: React.CSSProperties; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "inline-block", verticalAlign: "-3px", flexShrink: 0, ...style }}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Punto de estado sólido (reemplaza 🔴🟡🟢) — no es un ícono, es más chico y más claro a simple vista. */
export function StatusDot({ tone, size = 8 }: { tone: "ok" | "warn" | "danger"; size?: number }) {
  const color = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--accent-2)";
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        verticalAlign: "1px",
      }}
    />
  );
}
