"use client";

import { useState } from "react";
import { setAutoEnviarEmailAction, addEmailAction, removeEmailAction } from "@/app/(app)/configuracion/actions/emails";
import { Icon } from "@/components/icon";

export interface EmailRow {
  id: string;
  email: string;
  activo: boolean;
}

export function EmailsCard({ autoEnviar: initialAuto, emails: initialEmails }: { autoEnviar: boolean; emails: EmailRow[] }) {
  const [autoEnviar, setAutoEnviar] = useState(initialAuto);
  const [emails, setEmails] = useState(initialEmails);
  const [nuevo, setNuevo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleAuto() {
    const next = !autoEnviar;
    setAutoEnviar(next);
    const res = await setAutoEnviarEmailAction(next);
    if (!res.success) setAutoEnviar(!next);
  }

  async function addEmail() {
    if (!nuevo.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addEmailAction(nuevo);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar.");
      return;
    }
    setEmails((prev) => [...prev, { id: crypto.randomUUID(), email: nuevo.trim().toLowerCase(), activo: true }]);
    setNuevo("");
  }

  async function removeEmail(row: EmailRow) {
    setBusy(true);
    const res = await removeEmailAction(row.id, row.email);
    setBusy(false);
    if (res.success) setEmails((prev) => prev.filter((e) => e.id !== row.id));
  }

  return (
    <div className="card">
      <div className="section-label">Envío automático por email</div>
      <div className="switch-row">
        <div className="txt">
          <b>Enviar el PDF automáticamente al generarlo</b>
          <span>Se manda apenas termina de generarse, a los destinatarios de abajo</span>
        </div>
        <label className="switch">
          <input type="checkbox" checked={autoEnviar} onChange={toggleAuto} />
          <span className="slider"></span>
        </label>
      </div>
      <div className="email-row">
        <input
          type="email"
          placeholder="nombre@empresa.com"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          disabled={busy}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={addEmail} disabled={busy}>
          + Agregar
        </button>
      </div>
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="item-list" style={{ marginTop: 0 }}>
        {emails.length === 0 ? (
          <div className="empty-note">Todavía no agregaste destinatarios.</div>
        ) : (
          emails.map((e) => (
            <div className="list-item" key={e.id}>
              <div className="info">
                <div className="avatar">
                  <Icon name="mail" size={14} />
                </div>
                <div className="item-name">{e.email}</div>
              </div>
              <button type="button" className="remove-btn" onClick={() => removeEmail(e)} disabled={busy}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
