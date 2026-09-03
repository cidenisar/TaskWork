"use client";

import { useRef, useState } from "react";
import { subirLogoAction, quitarLogoAction } from "@/app/(app)/configuracion/actions/empresa";
import { Icon } from "@/components/icon";

export function EmpresaCard({ logoUrl: initialLogoUrl }: { logoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("logo", file);
    const res = await subirLogoAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo subir el logo.");
      return;
    }
    setLogoUrl(URL.createObjectURL(file));
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    const res = await quitarLogoAction();
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo quitar el logo.");
      return;
    }
    setLogoUrl(null);
  }

  return (
    <div className="card">
      <div className="section-label">Datos de la Empresa</div>
      <div className="field">
        <label>Logo</label>
        <div className="logo-upload">
          <div className="logo-preview">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview del logo recién subido (blob: URL) o público de Storage
              <img src={logoUrl} alt="Logo de la empresa" />
            ) : (
              <Icon name="building" size={22} />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleUpload(e.target.files)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                ↑ Subir Logo
              </button>
              {logoUrl && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={handleRemove}>
                  Quitar
                </button>
              )}
            </div>
            <div className="hint">Se usa automáticamente en la cabecera de todos los PDF que generes de acá en adelante.</div>
            {error && <div className="error-text">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
