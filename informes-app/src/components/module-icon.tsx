const ICON_PATHS: Record<string, React.ReactNode> = {
  informe: (
    <>
      <path d="M8 3h6l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="m9.5 13 2 2 4-4" />
    </>
  ),
  rendicion: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1H3V7Z" />
      <path d="M3 8v9a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2 2 2 0 0 1-2 2H3Z" />
      <circle cx="17" cy="14" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  estadisticas: (
    <>
      <path d="M4 20V10" />
      <path d="M11 20V4" />
      <path d="M18 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  configuracion: (
    <>
      <path d="M4 7h10" />
      <circle cx="17" cy="7" r="2" />
      <path d="M20 17H10" />
      <circle cx="7" cy="17" r="2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  tableros: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
      <path d="M8 8v3.5M12 8v3.5M16 8v3.5" />
      <path d="M7.5 15.5h9" />
    </>
  ),
  racks: (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="1.5" />
      <rect x="6.5" y="5.5" width="11" height="3" rx="0.6" />
      <rect x="6.5" y="10.5" width="11" height="3" rx="0.6" />
      <rect x="6.5" y="15.5" width="11" height="3" rx="0.6" />
      <circle cx="15" cy="7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  ubicaciones: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </>
  ),
  relevamiento: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.3" />
    </>
  ),
  equipos: (
    <>
      <path d="M13 2 7 13h4l-1 9 7-12h-4l1-8Z" />
    </>
  ),
};

/**
 * Íconos de línea simples (nunca emoji) para las cards de módulo de la
 * pantalla de inicio y otros puntos de entrada — mismo gradiente naranja/rojo
 * del acento en vez de dibujitos de colores desparejos. `tone="muted"` usa el
 * panel oscuro en vez del gradiente, para estados neutros (ej. "sin acceso").
 */
export function ModuleIcon({
  name,
  size = 44,
  tone = "accent",
}: {
  name: keyof typeof ICON_PATHS;
  size?: number;
  tone?: "accent" | "muted";
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: tone === "accent" ? "var(--accent-grad)" : "var(--panel-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        stroke={tone === "accent" ? "#fff" : "var(--text-dim)"}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICON_PATHS[name]}
      </svg>
    </div>
  );
}
