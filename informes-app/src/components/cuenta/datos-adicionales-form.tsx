"use client";

import { useState } from "react";
import { actualizarDatosAdicionalesAction } from "@/app/(app)/cuenta/actions";
import { VencBadge } from "@/components/venc-badge";
import { SuccessNote } from "@/components/notes";

const FACTORES_SANGUINEOS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export interface DatosAdicionales {
  dni: string | null;
  dniVencimiento: string | null;
  fechaNacimiento: string | null;
  factorSanguineo: string | null;
  licenciaConducirVencimiento: string | null;
  emailAlternativo: string | null;
  contactoEmergenciaNombre: string | null;
  contactoEmergenciaTelefono: string | null;
  tallaCamisa: string | null;
  tallaPantalon: string | null;
  tallaRemera: string | null;
  tallaCampera: string | null;
  tallaMameluco: string | null;
  tallaBotines: string | null;
}

export function DatosAdicionalesForm({ initial }: { initial: DatosAdicionales }) {
  const [datos, setDatos] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function set<K extends keyof DatosAdicionales>(campo: K, valor: string) {
    setDatos((prev) => ({ ...prev, [campo]: valor }));
  }

  async function guardar() {
    setError(null);
    setOk(false);
    setBusy(true);
    const fd = new FormData();
    fd.set("dni", datos.dni ?? "");
    fd.set("dniVencimiento", datos.dniVencimiento ?? "");
    fd.set("fechaNacimiento", datos.fechaNacimiento ?? "");
    fd.set("factorSanguineo", datos.factorSanguineo ?? "");
    fd.set("licenciaConducirVencimiento", datos.licenciaConducirVencimiento ?? "");
    fd.set("emailAlternativo", datos.emailAlternativo ?? "");
    fd.set("contactoEmergenciaNombre", datos.contactoEmergenciaNombre ?? "");
    fd.set("contactoEmergenciaTelefono", datos.contactoEmergenciaTelefono ?? "");
    fd.set("tallaCamisa", datos.tallaCamisa ?? "");
    fd.set("tallaPantalon", datos.tallaPantalon ?? "");
    fd.set("tallaRemera", datos.tallaRemera ?? "");
    fd.set("tallaCampera", datos.tallaCampera ?? "");
    fd.set("tallaMameluco", datos.tallaMameluco ?? "");
    fd.set("tallaBotines", datos.tallaBotines ?? "");

    const res = await actualizarDatosAdicionalesAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudieron guardar los datos.");
      return;
    }
    setOk(true);
  }

  return (
    <div className="card">
      <div className="section-label">Documentación personal</div>
      <p className="empty-note" style={{ marginBottom: 12 }}>
        Opcional por ahora — sirve para que a futuro la app avise cuándo se te vence algo, igual que
        ya hace con la documentación de los vehículos.
      </p>

      <div className="tech-form-grid">
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>DNI</label>
          <input type="text" value={datos.dni ?? ""} onChange={(e) => set("dni", e.target.value)} disabled={busy} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Vencimiento DNI</label>
          <input
            type="date"
            value={datos.dniVencimiento ?? ""}
            onChange={(e) => set("dniVencimiento", e.target.value)}
            disabled={busy}
          />
        </div>
      </div>
      {datos.dniVencimiento && (
        <div style={{ marginTop: 6 }}>
          <VencBadge label="DNI" fecha={datos.dniVencimiento} />
        </div>
      )}

      <div className="tech-form-grid" style={{ marginTop: 10 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Fecha de nacimiento</label>
          <input
            type="date"
            value={datos.fechaNacimiento ?? ""}
            onChange={(e) => set("fechaNacimiento", e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Grupo y factor sanguíneo</label>
          <select value={datos.factorSanguineo ?? ""} onChange={(e) => set("factorSanguineo", e.target.value)} disabled={busy}>
            <option value="">Sin cargar</option>
            {FACTORES_SANGUINEOS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tech-form-grid" style={{ marginTop: 10 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Vencimiento licencia de conducir</label>
          <input
            type="date"
            value={datos.licenciaConducirVencimiento ?? ""}
            onChange={(e) => set("licenciaConducirVencimiento", e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Email alternativo</label>
          <input
            type="email"
            value={datos.emailAlternativo ?? ""}
            onChange={(e) => set("emailAlternativo", e.target.value)}
            disabled={busy}
          />
        </div>
      </div>
      {datos.licenciaConducirVencimiento && (
        <div style={{ marginTop: 6 }}>
          <VencBadge label="Licencia de conducir" fecha={datos.licenciaConducirVencimiento} />
        </div>
      )}

      <div className="section-label" style={{ marginTop: 20 }}>
        Contacto de emergencia
      </div>
      <div className="tech-form-grid">
        <input
          type="text"
          placeholder="Nombre y apellido"
          value={datos.contactoEmergenciaNombre ?? ""}
          onChange={(e) => set("contactoEmergenciaNombre", e.target.value)}
          disabled={busy}
        />
        <input
          type="tel"
          placeholder="Teléfono"
          value={datos.contactoEmergenciaTelefono ?? ""}
          onChange={(e) => set("contactoEmergenciaTelefono", e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="section-label" style={{ marginTop: 20 }}>
        Talla de indumentaria
      </div>
      <div className="tech-form-grid">
        <input type="text" placeholder="Camisa (ej: M)" value={datos.tallaCamisa ?? ""} onChange={(e) => set("tallaCamisa", e.target.value)} disabled={busy} />
        <input type="text" placeholder="Pantalón (ej: 42)" value={datos.tallaPantalon ?? ""} onChange={(e) => set("tallaPantalon", e.target.value)} disabled={busy} />
      </div>
      <div className="tech-form-grid" style={{ marginTop: 10 }}>
        <input type="text" placeholder="Remera (ej: L)" value={datos.tallaRemera ?? ""} onChange={(e) => set("tallaRemera", e.target.value)} disabled={busy} />
        <input type="text" placeholder="Campera (ej: L)" value={datos.tallaCampera ?? ""} onChange={(e) => set("tallaCampera", e.target.value)} disabled={busy} />
      </div>
      <div className="tech-form-grid" style={{ marginTop: 10 }}>
        <input type="text" placeholder="Mameluco (ej: 44)" value={datos.tallaMameluco ?? ""} onChange={(e) => set("tallaMameluco", e.target.value)} disabled={busy} />
        <input type="text" placeholder="Botines (ej: 42)" value={datos.tallaBotines ?? ""} onChange={(e) => set("tallaBotines", e.target.value)} disabled={busy} />
      </div>

      <button type="button" className="btn btn-primary" onClick={guardar} disabled={busy} style={{ marginTop: 14 }}>
        {busy ? "Guardando..." : "Guardar estos datos"}
      </button>

      {error && (
        <div className="error-text" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      {ok && <SuccessNote style={{ marginTop: 10 }}>Datos actualizados.</SuccessNote>}
    </div>
  );
}
