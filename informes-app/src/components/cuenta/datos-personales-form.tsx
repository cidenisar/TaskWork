"use client";

import { useRef, useState } from "react";
import { actualizarDatosPersonalesAction } from "@/app/(app)/cuenta/actions";

export function DatosPersonalesForm({
  nombreCompleto: initialNombre,
  telefono: initialTelefono,
  fotoPerfilUrl: initialFoto,
}: {
  nombreCompleto: string;
  telefono: string | null;
  fotoPerfilUrl: string | null;
}) {
  const [nombreCompleto, setNombreCompleto] = useState(initialNombre);
  const [telefono, setTelefono] = useState(initialTelefono ?? "");
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initialFoto);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFotoChange(file: File | null) {
    setFoto(file);
    setPreview(file ? URL.createObjectURL(file) : initialFoto);
  }

  async function guardar() {
    setError(null);
    setOk(false);
    if (!nombreCompleto.trim()) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    setBusy(true);
    const formData = new FormData();
    formData.set("nombreCompleto", nombreCompleto);
    formData.set("telefono", telefono);
    if (foto) formData.set("foto", foto);

    const res = await actualizarDatosPersonalesAction(formData);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudieron guardar los datos.");
      return;
    }
    setOk(true);
    setFoto(null);
    if (res.fotoPerfilUrl !== undefined) setPreview(res.fotoPerfilUrl);
  }

  return (
    <div className="card">
      <div className="section-label">Mis datos</div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview local + avatar chico, no vale la pena next/image
          <img
            src={preview}
            alt=""
            style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div className="avatar" style={{ width: 64, height: 64, fontSize: 24 }}>
            {(nombreCompleto[0] || "?").toUpperCase()}
          </div>
        )}
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            Cambiar foto
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onFotoChange(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <div className="tech-form-grid">
        <input
          type="text"
          placeholder="Nombre completo"
          value={nombreCompleto}
          onChange={(e) => setNombreCompleto(e.target.value)}
          disabled={busy}
        />
        <input
          type="tel"
          placeholder="Teléfono (opcional)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          disabled={busy}
        />
      </div>

      <button type="button" className="btn btn-primary" onClick={guardar} disabled={busy} style={{ marginTop: 10 }}>
        {busy ? "Guardando..." : "Guardar mis datos"}
      </button>

      {error && (
        <div className="error-text" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      {ok && (
        <div className="success-note" style={{ marginTop: 10 }}>
          ✓ Datos actualizados.
        </div>
      )}
    </div>
  );
}
