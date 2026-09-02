"use client";

import { useState } from "react";
import { crearUsuarioAction, cambiarRolAction } from "@/app/(app)/configuracion/actions/usuarios";
import { ROL_LABEL, type Rol } from "@/lib/types";

export interface UsuarioRow {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: Rol;
}

const ROLES: Rol[] = ["tecnico", "supervisor", "admin"];

export function UsuariosCard({ usuarios: initial, currentUserId }: { usuarios: UsuarioRow[]; currentUserId: string }) {
  const [usuarios, setUsuarios] = useState(initial);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("tecnico");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);
  const [rolBusyId, setRolBusyId] = useState<string | null>(null);

  async function crear() {
    if (!email.trim() || !nombre.trim()) {
      setError("Completá el nombre y el email.");
      return;
    }
    setBusy(true);
    setError(null);
    setCreado(null);
    const res = await crearUsuarioAction(email, nombre, rol);
    setBusy(false);
    if (!res.success || !res.credenciales) {
      setError(res.error || "No se pudo crear el usuario.");
      return;
    }
    setUsuarios((prev) => [
      ...prev,
      { id: crypto.randomUUID(), email: res.credenciales!.email, nombreCompleto: nombre.trim(), rol },
    ]);
    setCreado(res.credenciales);
    setEmail("");
    setNombre("");
    setRol("tecnico");
  }

  async function cambiarRol(u: UsuarioRow, nuevoRol: Rol) {
    if (nuevoRol === u.rol) return;
    const anterior = u.rol;
    setRolBusyId(u.id);
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, rol: nuevoRol } : x)));
    const res = await cambiarRolAction(u.id, u.nombreCompleto, nuevoRol);
    setRolBusyId(null);
    if (!res.success) {
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, rol: anterior } : x)));
      setError(res.error || "No se pudo cambiar el rol.");
    }
  }

  return (
    <div className="card">
      <div className="section-label">Usuarios y roles</div>
      <p className="empty-note" style={{ marginBottom: 12 }}>
        Los técnicos no se registran solos — un Administrador crea la cuenta acá y le pasa la
        contraseña temporal. El rol se puede subir o bajar en cualquier momento.
      </p>

      <div className="tech-form-grid">
        <input
          type="text"
          placeholder="Nombre completo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          disabled={busy}
        />
        <input
          type="email"
          placeholder="email@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>
      <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={busy} style={{ marginTop: 10 }}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROL_LABEL[r]}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-primary" onClick={crear} disabled={busy} style={{ marginTop: 10 }}>
        + Crear usuario
      </button>

      {error && (
        <div className="error-text" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      {creado && (
        <div className="card" style={{ marginTop: 10, background: "var(--bg-input, #1a1a1a)" }}>
          <b>Usuario creado ✓</b>
          <div className="item-sub">
            Pasale estas credenciales — no se van a volver a mostrar:
          </div>
          <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 14 }}>
            {creado.email}
            <br />
            {creado.password}
          </div>
        </div>
      )}

      <div className="item-list">
        {usuarios.map((u) => (
          <div className="list-item" key={u.id}>
            <div className="info">
              <div className="avatar">{(u.nombreCompleto[0] || "?").toUpperCase()}</div>
              <div>
                <div className="item-name">{u.nombreCompleto}</div>
                <div className="item-sub">{u.email}</div>
              </div>
            </div>
            <select
              value={u.rol}
              disabled={rolBusyId === u.id || u.id === currentUserId}
              onChange={(e) => cambiarRol(u, e.target.value as Rol)}
              title={u.id === currentUserId ? "No podés cambiar tu propio rol" : undefined}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROL_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
