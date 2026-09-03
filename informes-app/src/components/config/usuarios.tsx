"use client";

import { useState } from "react";
import {
  crearUsuarioAction,
  cambiarRolAction,
  cambiarTorreAction,
  editarUsuarioAction,
  blanquearPasswordAction,
  desactivarUsuarioAction,
  reactivarUsuarioAction,
} from "@/app/(app)/configuracion/actions/usuarios";
import { ROL_LABEL, type Rol } from "@/lib/types";
import { Icon } from "@/components/icon";

export interface UsuarioRow {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: Rol;
  torre: string | null;
  activo: boolean;
}

const ROLES: Rol[] = ["tecnico", "supervisor", "admin"];

export function UsuariosCard({
  usuarios: initial,
  currentUserId,
  torres,
}: {
  usuarios: UsuarioRow[];
  currentUserId: string;
  torres: string[];
}) {
  const [usuarios, setUsuarios] = useState(initial);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("tecnico");
  const [torre, setTorre] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);
  const [rolBusyId, setRolBusyId] = useState<string | null>(null);
  const [torreBusyId, setTorreBusyId] = useState<string | null>(null);

  // Estado por fila: edición de nombre/email, contraseña blanqueada (se
  // muestra una sola vez), y qué acción está en curso.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [blanqueado, setBlanqueado] = useState<Record<string, string>>({});

  async function crear() {
    if (!email.trim() || !nombre.trim()) {
      setError("Completá el nombre y el email.");
      return;
    }
    setBusy(true);
    setError(null);
    setCreado(null);
    const res = await crearUsuarioAction(email, nombre, rol, torre);
    setBusy(false);
    if (!res.success || !res.credenciales) {
      setError(res.error || "No se pudo crear el usuario.");
      return;
    }
    setUsuarios((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        email: res.credenciales!.email,
        nombreCompleto: nombre.trim(),
        rol,
        torre: torre.trim() || null,
        activo: true,
      },
    ]);
    setCreado(res.credenciales);
    setEmail("");
    setNombre("");
    setRol("tecnico");
    setTorre("");
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

  async function cambiarTorre(u: UsuarioRow, nuevaTorre: string) {
    const valor = nuevaTorre.trim() || null;
    if (valor === u.torre) return;
    const anterior = u.torre;
    setTorreBusyId(u.id);
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, torre: valor } : x)));
    const res = await cambiarTorreAction(u.id, u.nombreCompleto, nuevaTorre);
    setTorreBusyId(null);
    if (!res.success) {
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, torre: anterior } : x)));
      setError(res.error || "No se pudo cambiar la torre.");
    }
  }

  function empezarEdicion(u: UsuarioRow) {
    setEditingId(u.id);
    setEditNombre(u.nombreCompleto);
    setEditEmail(u.email);
    setRowError((prev) => ({ ...prev, [u.id]: "" }));
  }

  async function guardarEdicion(u: UsuarioRow) {
    if (!editNombre.trim() || !editEmail.trim()) {
      setRowError((prev) => ({ ...prev, [u.id]: "Completá el nombre y el email." }));
      return;
    }
    setRowBusyId(u.id);
    const res = await editarUsuarioAction(u.id, editNombre, editEmail);
    setRowBusyId(null);
    if (!res.success) {
      setRowError((prev) => ({ ...prev, [u.id]: res.error || "No se pudo guardar." }));
      return;
    }
    setUsuarios((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, nombreCompleto: editNombre.trim(), email: editEmail.trim().toLowerCase() } : x)),
    );
    setEditingId(null);
  }

  async function blanquear(u: UsuarioRow) {
    setRowBusyId(u.id);
    setRowError((prev) => ({ ...prev, [u.id]: "" }));
    const res = await blanquearPasswordAction(u.id, u.nombreCompleto);
    setRowBusyId(null);
    if (!res.success || !res.password) {
      setRowError((prev) => ({ ...prev, [u.id]: res.error || "No se pudo blanquear la contraseña." }));
      return;
    }
    setBlanqueado((prev) => ({ ...prev, [u.id]: res.password! }));
  }

  async function toggleActivo(u: UsuarioRow) {
    setRowBusyId(u.id);
    setRowError((prev) => ({ ...prev, [u.id]: "" }));
    const res = u.activo ? await desactivarUsuarioAction(u.id, u.nombreCompleto) : await reactivarUsuarioAction(u.id, u.nombreCompleto);
    setRowBusyId(null);
    if (!res.success) {
      setRowError((prev) => ({ ...prev, [u.id]: res.error || "No se pudo actualizar." }));
      return;
    }
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, activo: !u.activo } : x)));
  }

  return (
    <div className="card">
      <div className="section-label">Usuarios y roles</div>
      <p className="empty-note" style={{ marginBottom: 12 }}>
        Los técnicos no se registran solos — un Administrador crea la cuenta acá y le pasa la
        contraseña temporal. Esta lista es también el catálogo de técnicos que aparece sugerido en
        Informe Técnico y Rendición de Gastos (los desactivados ya no aparecen ahí, pero conservan
        todo su historial) — no hay una carga aparte.
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
      <div className="tech-form-grid" style={{ marginTop: 10 }}>
        <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={busy}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROL_LABEL[r]}
            </option>
          ))}
        </select>
        <input
          type="text"
          list="usuarios-torre-list"
          placeholder="Torre (opcional)"
          value={torre}
          onChange={(e) => setTorre(e.target.value)}
          disabled={busy}
        />
      </div>
      <datalist id="usuarios-torre-list">
        {torres.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
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
          <b>
            Usuario creado <Icon name="check" size={13} />
          </b>
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
        {usuarios.map((u) => {
          const editing = editingId === u.id;
          const rowBusy = rowBusyId === u.id;
          return (
            <div
              className="list-item"
              key={u.id}
              style={{ flexDirection: "column", alignItems: "stretch", gap: 8, opacity: u.activo ? 1 : 0.6 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", flexWrap: "wrap", gap: 8 }}>
                <div className="info">
                  <div className="avatar">{(u.nombreCompleto[0] || "?").toUpperCase()}</div>
                  <div>
                    <div className="item-name">
                      {u.nombreCompleto}
                      {!u.activo && <span className="badge">INACTIVO</span>}
                    </div>
                    <div className="item-sub">{u.email}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    list="usuarios-torre-list"
                    defaultValue={u.torre ?? ""}
                    placeholder="Torre"
                    disabled={torreBusyId === u.id}
                    onBlur={(e) => cambiarTorre(u, e.target.value)}
                    style={{ width: 110 }}
                  />
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
              </div>

              {editing ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    disabled={rowBusy}
                    style={{ maxWidth: 220 }}
                  />
                  <input
                    type="email"
                    placeholder="email@empresa.com"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    disabled={rowBusy}
                    style={{ maxWidth: 220 }}
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => guardarEdicion(u)} disabled={rowBusy}>
                    {rowBusy ? "Guardando..." : "Guardar"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)} disabled={rowBusy}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => empezarEdicion(u)} disabled={rowBusy}>
                    <Icon name="edit" size={13} /> Editar
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => blanquear(u)} disabled={rowBusy}>
                    <Icon name="lock" size={13} /> Blanquear contraseña
                  </button>
                  {u.id !== currentUserId && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleActivo(u)} disabled={rowBusy}>
                      <Icon name={u.activo ? "x" : "check"} size={13} /> {u.activo ? "Desactivar" : "Reactivar"}
                    </button>
                  )}
                </div>
              )}

              {rowError[u.id] && <div className="error-text">{rowError[u.id]}</div>}
              {blanqueado[u.id] && (
                <div className="card" style={{ background: "var(--bg-input, #1a1a1a)" }}>
                  <b>
                    Contraseña blanqueada <Icon name="check" size={13} />
                  </b>
                  <div className="item-sub">Pasale esta contraseña nueva — no se vuelve a mostrar:</div>
                  <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 14 }}>{blanqueado[u.id]}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
