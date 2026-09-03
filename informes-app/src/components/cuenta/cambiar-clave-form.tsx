"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SuccessNote } from "@/components/notes";

export function CambiarClaveForm() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function guardar() {
    setError(null);
    setOk(false);
    if (nueva.length < 8) {
      setError("La contraseña nueva tiene que tener al menos 8 caracteres.");
      return;
    }
    if (nueva !== confirmar) {
      setError("Las dos contraseñas nuevas no coinciden.");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    // Confirmamos la contraseña actual re-autenticando contra el propio email
    // antes de cambiarla — evita que alguien con la sesión abierta (celular
    // prestado, olvidado sin cerrar sesión) le cambie la clave a otra persona.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setBusy(false);
      setError("No se pudo verificar tu sesión. Recargá la página e intentá de nuevo.");
      return;
    }
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: actual,
    });
    if (reauthError) {
      setBusy(false);
      setError("La contraseña actual no es correcta.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: nueva });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOk(true);
    setActual("");
    setNueva("");
    setConfirmar("");
  }

  return (
    <div className="card">
      <div className="section-label">Cambiar mi contraseña</div>
      <p className="empty-note" style={{ marginBottom: 12 }}>
        Si un Administrador te creó la cuenta con una contraseña temporal, cambiala acá por una que
        solo sepas vos.
      </p>

      <input
        type="password"
        placeholder="Contraseña actual"
        value={actual}
        onChange={(e) => setActual(e.target.value)}
        disabled={busy}
        style={{ marginBottom: 10 }}
      />
      <input
        type="password"
        placeholder="Contraseña nueva (mínimo 8 caracteres)"
        value={nueva}
        onChange={(e) => setNueva(e.target.value)}
        disabled={busy}
        style={{ marginBottom: 10 }}
      />
      <input
        type="password"
        placeholder="Repetí la contraseña nueva"
        value={confirmar}
        onChange={(e) => setConfirmar(e.target.value)}
        disabled={busy}
        style={{ marginBottom: 10 }}
      />

      <button type="button" className="btn btn-primary" onClick={guardar} disabled={busy}>
        {busy ? "Guardando..." : "Guardar contraseña nueva"}
      </button>

      {error && (
        <div className="error-text" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
      {ok && <SuccessNote style={{ marginTop: 10 }}>Contraseña actualizada.</SuccessNote>}
    </div>
  );
}
