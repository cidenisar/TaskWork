"use client";

import { useRef, useState } from "react";
import { subirLogoAction, quitarLogoAction, guardarNombreEmpresaAction } from "@/app/(app)/configuracion/actions/empresa";
import { Icon } from "@/components/icon";

export function EmpresaCard({ logoUrl: initialLogoUrl, nombre: initialNombre }: { logoUrl: string | null; nombre: string }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState(initialNombre);
  const [nombreGuardado, setNombreGuardado] = useState(initialNombre);
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [nombreError, setNombreError] = useState<string | null>(null);

  async function handleGuardarNombre() {
    setGuardandoNombre(true);
    setNombreError(null);
    const res = await guardarNombreEmpresaAction(nombre);
    setGuardandoNombre(false);
    if (!res.success) {
      setNombreError(res.error || "No se pudo guardar el nombre.");
      return;
    }
    setNombreGuardado(nombre.trim());
  }

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
        <label>Nombre</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre de la empresa"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={guardandoNombre || nombre.trim() === nombreGuardado}
            onClick={handleGuardarNombre}
          >
            Guardar
          </button>
        </div>
        <div className="hint">Aparece en el rótulo de los planos que se generan (ej. esquema unifilar de Tableros).</div>
        {nombreError && <div className="error-text">{nombreError}</div>}
      </div>
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
