"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { BateriaCampos, useFuentesBateria } from "@/components/baterias/bateria-campos";
import { actualizarBateriaAction } from "@/app/panel/baterias/actions";
import type { DatosBateria } from "@/lib/baterias/types";
import type { TipoFuenteBateria } from "@/lib/database.types";

interface Props {
  tipo: TipoFuenteBateria;
  id: string;
  categoria: string;
  texto: string;
  marcaModelo: string;
  ubicacionId: string;
  datos: DatosBateria;
}

/** El formulario vive en un componente aparte para que la lista de rectificadores/UPS del sitio solo se pida cuando se abre (no una vez por fila). */
function Formulario({ tipo, id, categoria, texto, marcaModelo, ubicacionId, datos: datosIniciales, onCerrar }: Props & { onCerrar: () => void }) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosBateria>(datosIniciales);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fuentes = useFuentesBateria(ubicacionId).filter((f) => !(f.tipo === tipo && f.id === id));

  async function guardar() {
    setBusy(true);
    setError(null);
    const res = await actualizarBateriaAction({ tipo, id, datos });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    onCerrar();
    router.refresh();
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onCerrar()}>
      <div className="modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="section-label" style={{ marginBottom: 4 }}>
          Baterías
        </div>
        <p className="hint" style={{ margin: "0 0 14px" }}>
          {texto}
        </p>
        <BateriaCampos
          categoria={categoria}
          marcaModelo={marcaModelo}
          datos={datos}
          onChange={(patch) => setDatos((prev) => ({ ...prev, ...patch }))}
          fuentes={fuentes}
          disabled={busy}
        />
        {error && (
          <div className="error-text" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCerrar} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={guardar} disabled={busy}>
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EditarBateriaButton(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn" title="Editar baterías" aria-label="Editar baterías" onClick={() => setOpen(true)}>
        <Icon name="edit" size={15} />
      </button>
      {open && <Formulario {...props} onCerrar={() => setOpen(false)} />}
    </>
  );
}
