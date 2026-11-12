"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  guardarRecursoFijoAction,
  agregarBandaRecursoAlturaAction,
  quitarBandaRecursoAlturaAction,
} from "@/app/(app)/configuracion/actions/recurso-altura";
import { TIPO_MONTAJE_OPCIONES, TIPO_MONTAJE_LABEL } from "@/lib/equipos/recurso-altura";
import { SimpleCatalogTab, type SimpleCatalogItem } from "./simple-catalog-tab";
import { Icon } from "@/components/icon";
import type { TipoMontajeCamara } from "@/lib/database.types";

export interface RecursoAlturaItem {
  tipoMontaje: TipoMontajeCamara;
  recursoFijo: string | null;
}

export interface BandaRecursoAlturaItem {
  id: string;
  tipoMontaje: TipoMontajeCamara;
  alturaHastaM: number;
  recurso: string;
}

/**
 * Qué recurso hace falta para el mantenimiento de una cámara/domo según
 * dónde está montada (Equipos Individuales → Montaje, al relevarla) — ver
 * `lib/equipos/recurso-altura.ts`. "Recurso fijo" ignora la altura (ej.
 * Torre siempre necesita el grupo de altura); dejándolo en "Según altura"
 * se decide por las bandas de abajo (hasta tantos metros, tal recurso —
 * mismo criterio que Calibre de cable), en vez de un único umbral fijo, así
 * se puede escalonar Escalera → Andamóvil → Andamio/Manlift sin código
 * nuevo. Los nombres de recurso en sí (incluido "Andamóvil") salen de un
 * catálogo abierto que un Admin edita más abajo.
 */
export function RecursoAlturaTab({
  items: initialItems,
  bandas: initialBandas,
  tiposRecurso,
}: {
  items: RecursoAlturaItem[];
  bandas: BandaRecursoAlturaItem[];
  tiposRecurso: SimpleCatalogItem[];
}) {
  const router = useRouter();
  const [recursoFijo, setRecursoFijo] = useState<Record<TipoMontajeCamara, string>>(() => {
    const init = {} as Record<TipoMontajeCamara, string>;
    for (const t of TIPO_MONTAJE_OPCIONES) init[t] = initialItems.find((x) => x.tipoMontaje === t)?.recursoFijo ?? "";
    return init;
  });
  const [bandas, setBandas] = useState(initialBandas);
  const [nuevaAltura, setNuevaAltura] = useState<Record<TipoMontajeCamara, string>>(() => {
    const init = {} as Record<TipoMontajeCamara, string>;
    for (const t of TIPO_MONTAJE_OPCIONES) init[t] = "";
    return init;
  });
  const [nuevoRecurso, setNuevoRecurso] = useState<Record<TipoMontajeCamara, string>>(() => {
    const init = {} as Record<TipoMontajeCamara, string>;
    for (const t of TIPO_MONTAJE_OPCIONES) init[t] = "";
    return init;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardarFijo(tipoMontaje: TipoMontajeCamara) {
    setBusy(tipoMontaje);
    setError(null);
    const res = await guardarRecursoFijoAction(tipoMontaje, recursoFijo[tipoMontaje]);
    setBusy(null);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    router.refresh();
  }

  async function agregarBanda(tipoMontaje: TipoMontajeCamara) {
    const altura = nuevaAltura[tipoMontaje];
    const recurso = nuevoRecurso[tipoMontaje];
    if (!altura.trim() || !recurso.trim()) return;
    setBusy(`banda-${tipoMontaje}`);
    setError(null);
    const res = await agregarBandaRecursoAlturaAction(tipoMontaje, altura, recurso);
    setBusy(null);
    if (!res.success) {
      setError(res.error || "No se pudo agregar la banda.");
      return;
    }
    setBandas((prev) => [...prev, { id: crypto.randomUUID(), tipoMontaje, alturaHastaM: Number(altura), recurso: recurso.trim() }]);
    setNuevaAltura((prev) => ({ ...prev, [tipoMontaje]: "" }));
    setNuevoRecurso((prev) => ({ ...prev, [tipoMontaje]: "" }));
  }

  async function quitarBanda(id: string) {
    setBusy(id);
    setError(null);
    const res = await quitarBandaRecursoAlturaAction(id);
    setBusy(null);
    if (!res.success) {
      setError(res.error || "No se pudo quitar la banda.");
      return;
    }
    setBandas((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        &ldquo;Recurso fijo&rdquo; ignora la altura (ej. Torre siempre necesita el grupo de altura); dejándolo en &ldquo;Según
        altura&rdquo; se decide por las bandas de esa fila (hasta tantos metros, tal recurso).
      </div>
      <div className="item-list">
        {TIPO_MONTAJE_OPCIONES.map((tipo) => {
          const bandasTipo = bandas.filter((b) => b.tipoMontaje === tipo).sort((a, b) => a.alturaHastaM - b.alturaHastaM);
          return (
            <div className="list-item" key={tipo} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <div className="item-name" style={{ minWidth: 80 }}>
                  {TIPO_MONTAJE_LABEL[tipo]}
                </div>
                <select
                  value={recursoFijo[tipo]}
                  onChange={(e) => setRecursoFijo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                  disabled={busy === tipo}
                  style={{ width: 170 }}
                >
                  <option value="">Según altura</option>
                  {tiposRecurso.map((r) => (
                    <option key={r.id} value={r.nombre}>
                      Siempre: {r.nombre}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => guardarFijo(tipo)} disabled={busy === tipo}>
                  {busy === tipo ? "Guardando..." : "Guardar"}
                </button>
              </div>

              {!recursoFijo[tipo] && (
                <div style={{ marginLeft: 0, paddingLeft: 12, borderLeft: "2px solid var(--field-border)" }}>
                  {bandasTipo.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 6 }}>
                      {bandasTipo.map((b) => (
                        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                          <span>
                            Hasta <strong>{b.alturaHastaM}m</strong> → {b.recurso}
                          </span>
                          <button
                            type="button"
                            className="remove-btn"
                            onClick={() => quitarBanda(b.id)}
                            disabled={busy === b.id}
                            aria-label="Quitar banda"
                          >
                            <Icon name="x" size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="item-sub">Hasta</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej: 4"
                      value={nuevaAltura[tipo]}
                      onChange={(e) => setNuevaAltura((prev) => ({ ...prev, [tipo]: e.target.value }))}
                      disabled={busy === `banda-${tipo}`}
                      style={{ width: 60 }}
                    />
                    <span className="item-sub">m →</span>
                    <select
                      value={nuevoRecurso[tipo]}
                      onChange={(e) => setNuevoRecurso((prev) => ({ ...prev, [tipo]: e.target.value }))}
                      disabled={busy === `banda-${tipo}`}
                      style={{ width: 150 }}
                    >
                      <option value="">Elegir recurso...</option>
                      {tiposRecurso.map((r) => (
                        <option key={r.id} value={r.nombre}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => agregarBanda(tipo)}
                      disabled={busy === `banda-${tipo}` || !nuevaAltura[tipo].trim() || !nuevoRecurso[tipo].trim()}
                    >
                      + Agregar banda
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}

      <div className="section-label" style={{ marginTop: 18 }}>
        Recursos disponibles
      </div>
      <SimpleCatalogTab
        tabla="catalogo_tipos_recurso_altura"
        items={tiposRecurso}
        placeholder="Ej: Andamóvil"
        hint="Los recursos que aparecen arriba en los desplegables — agregá uno nuevo acá (recargá la página para verlo en los desplegables de arriba) sin tocar código."
      />
    </div>
  );
}
