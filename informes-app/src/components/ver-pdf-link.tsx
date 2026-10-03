"use client";

import { useState } from "react";

/**
 * Link "ver PDF" que pide una URL firmada RECIÉN en el momento del click, en
 * vez de usar la que devolvió la Server Action de creación/cierre —
 * esa URL firmada vence (por defecto a la hora) y si el técnico la abre
 * mucho después, o si por lo que sea quedó vieja, Supabase Storage la
 * rechaza con "InvalidJWT / exp claim timestamp check failed". Pedirla al
 * tocar el link (igual criterio que ya usa Historial) evita depender de
 * cuánto tiempo pasó entre generarla y usarla.
 */
const TEXT_LINK_STYLE: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: "inherit",
  textDecoration: "underline",
  font: "inherit",
};

export function VerPdfLink({
  obtenerUrl,
  children = "ver PDF",
  className,
  style,
}: {
  obtenerUrl: () => Promise<{ url: string | null; error?: string }>;
  children?: React.ReactNode;
  /** Para usar como botón con clases propias (ej. "btn btn-primary") en vez del link de texto por default. */
  className?: string;
  style?: React.CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    setBusy(true);
    setError(null);
    const res = await obtenerUrl();
    setBusy(false);
    if (!res.url) {
      setError(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void abrir()}
        disabled={busy}
        className={className}
        style={{ ...(className ? {} : TEXT_LINK_STYLE), ...(busy ? { cursor: "default" } : { cursor: "pointer" }), ...style }}
      >
        {busy ? "Abriendo..." : children}
      </button>
      {error && <span style={{ marginLeft: 6, color: "var(--warn)" }}>{error}</span>}
    </>
  );
}
