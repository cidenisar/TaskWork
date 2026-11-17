"use client";

import { useEffect, useState } from "react";
import { buscarTareasPendientesDelSitioAction, type TareaDelSitio } from "@/app/(app)/informe-tecnico/tareas-sitio-actions";

/**
 * Pendientes abiertos del sitio elegido (anotados en visitas anteriores) con una
 * casilla "resuelta en esta visita". Lo tildado se cierra al generar/guardar el
 * informe y aparece en su PDF. Si no hay sitio elegido o no hay pendientes, no se muestra.
 */
export function PendientesDelSitio({
  ubicacionId,
  informeId,
  seleccion,
  onChange,
}: {
  ubicacionId: string;
  informeId?: string;
  seleccion: string[];
  onChange: (ids: string[]) => void;
}) {
  // El resultado se guarda con la clave (sitio + informe) que lo pidió: si cambia el sitio,
  // lo viejo deja de valer solo, sin tener que "limpiar" el estado dentro del efecto.
  const clave = ubicacionId && ubicacionId !== "__new" ? `${ubicacionId}|${informeId ?? ""}` : null;
  const [resultado, setResultado] = useState<{ clave: string; tareas: TareaDelSitio[] } | null>(null);

  useEffect(() => {
    if (!clave) return;
    let cancelado = false;
    buscarTareasPendientesDelSitioAction(ubicacionId, informeId)
      .then((tareas) => {
        if (!cancelado) setResultado({ clave, tareas });
      })
      .catch(() => {
        if (!cancelado) setResultado({ clave, tareas: [] });
      });
    return () => {
      cancelado = true;
    };
  }, [clave, ubicacionId, informeId]);

  const tareas = resultado && resultado.clave === clave ? resultado.tareas : [];
  if (tareas.length === 0) return null;

  const marcadas = new Set(seleccion);
  function alternar(id: string) {
    const sig = new Set(marcadas);
    if (sig.has(id)) sig.delete(id);
    else sig.add(id);
    onChange([...sig]);
  }

  return (
    <div className="field pendientes-sitio">
      <label>
        Pendientes de este sitio <span className="opt">({tareas.length})</span>
      </label>
      <div className="hint">Tildá los que resolviste en esta visita: se cierran al generar el informe y salen en el PDF.</div>
      <ul className="pendientes-sitio-lista">
        {tareas.map((t) => (
          <li key={t.id}>
            <label className="pendiente-item">
              <input type="checkbox" checked={marcadas.has(t.id)} onChange={() => alternar(t.id)} />
              <span>
                {t.texto}
                <span className="item-sub">
                  {" "}
                  · hace {t.dias} {t.dias === 1 ? "día" : "días"}
                  {t.informeNumero ? ` · Informe ${t.informeNumero}` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
