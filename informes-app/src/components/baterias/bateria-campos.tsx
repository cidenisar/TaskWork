"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { buscarFuentesDeBateriaAction, type FuenteBateriaOpcion } from "@/app/(app)/ubicaciones/baterias-actions";
import {
  BATERIA_DESTINO_LABEL,
  BATERIA_DESTINO_OPCIONES,
  UPS_BATERIAS_LABEL,
  UPS_BATERIAS_OPCIONES,
  rolBateria,
  type DatosBateria,
} from "@/lib/baterias/types";
import type { BateriaDestino, UpsBaterias } from "@/lib/database.types";

/**
 * Rectificadores y UPS ya cargados en el sitio elegido, para vincularles un
 * banco. Se vuelve a pedir cuando cambia el sitio; mientras no haya sitio
 * (o sea uno nuevo) la lista es vacía. El resultado se guarda junto con el
 * sitio al que corresponde, así una respuesta tardía de otro sitio nunca se
 * muestra por error.
 */
export function useFuentesBateria(ubicacionId: string): FuenteBateriaOpcion[] {
  const [cargado, setCargado] = useState<{ ubicacionId: string; opciones: FuenteBateriaOpcion[] } | null>(null);
  useEffect(() => {
    if (!ubicacionId || ubicacionId === "__new") return;
    let cancelado = false;
    buscarFuentesDeBateriaAction(ubicacionId)
      .then((opciones) => {
        if (!cancelado) setCargado({ ubicacionId, opciones });
      })
      .catch(() => {
        if (!cancelado) setCargado({ ubicacionId, opciones: [] });
      });
    return () => {
      cancelado = true;
    };
  }, [ubicacionId]);
  return cargado && cargado.ubicacionId === ubicacionId ? cargado.opciones : [];
}

const claveFuente = (tipo: string, id: string) => `${tipo}:${id}`;

/** Si hay exactamente una fuente de esa clase en el sitio, es la candidata obvia para un banco recién detectado. */
export function fuenteUnicaDeClase(fuentes: FuenteBateriaOpcion[], clase: BateriaDestino | null): FuenteBateriaOpcion | null {
  if (!clase) return null;
  const delTipo = fuentes.filter((f) => f.clase === clase);
  return delTipo.length === 1 ? delTipo[0] : null;
}

/**
 * Campos de baterías de un equipo según lo que es: un banco (a qué sirve,
 * cuántas baterías, de qué tipo, a qué rectificador/UPS pertenece), una UPS
 * (potencia, si usa baterías internas o banco externo, cuántas) o un
 * rectificador (potencia). No muestra nada para las demás categorías.
 */
export function BateriaCampos({
  categoria,
  datos,
  onChange,
  fuentes,
  disabled,
}: {
  categoria: string;
  datos: DatosBateria;
  onChange: (patch: Partial<DatosBateria>) => void;
  fuentes: FuenteBateriaOpcion[];
  disabled?: boolean;
}) {
  const rol = rolBateria(categoria);
  if (!rol) return null;

  const candidatas = datos.bateriaDestino ? fuentes.filter((f) => f.clase === datos.bateriaDestino) : fuentes;
  const vinculada = datos.alimentadoPorTipo && datos.alimentadoPorId ? claveFuente(datos.alimentadoPorTipo, datos.alimentadoPorId) : "";
  // Un vínculo que ya no está en la lista (equipo dado de baja, otro sitio) se muestra igual, para no borrarlo sin querer.
  const vinculadaEnLista = !vinculada || fuentes.some((f) => claveFuente(f.tipo, f.id) === vinculada);

  function cambiarCantidad(valor: string) {
    const n = valor === "" ? null : Number(valor);
    onChange({ bateriaCantidad: n, bateriaOrigen: n ? "manual" : null });
  }

  const campoCantidad = (etiqueta: string) => (
    <div className="field" style={{ marginBottom: 0, width: 120 }}>
      <label style={{ fontSize: 11 }}>{etiqueta}</label>
      <input
        type="number"
        min={1}
        placeholder="IA / manual"
        value={datos.bateriaCantidad ?? ""}
        onChange={(ev) => cambiarCantidad(ev.target.value)}
        disabled={disabled}
      />
    </div>
  );
  const campoTipo = (
    <div className="field" style={{ marginBottom: 0, width: 130 }}>
      <label style={{ fontSize: 11 }}>Tipo de batería</label>
      <input
        type="text"
        placeholder="Ej: 12 V 150 Ah"
        value={datos.bateriaTipo}
        onChange={(ev) => onChange({ bateriaTipo: ev.target.value })}
        disabled={disabled}
      />
    </div>
  );
  const campoPotencia = (
    <div className="field" style={{ marginBottom: 0, width: 150 }}>
      <label style={{ fontSize: 11 }}>Potencia {rol === "ups" ? "de la UPS" : "del rectificador"}</label>
      <input
        type="text"
        placeholder="Ej: 10 kVA / 48 Vcc 100 A"
        value={datos.potenciaNominal}
        onChange={(ev) => onChange({ potenciaNominal: ev.target.value })}
        disabled={disabled}
      />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {rol === "banco" && (
          <>
            <div className="field" style={{ marginBottom: 0, width: 140 }}>
              <label style={{ fontSize: 11 }}>El banco es de</label>
              <select
                value={datos.bateriaDestino ?? ""}
                onChange={(ev) => onChange({ bateriaDestino: (ev.target.value || null) as BateriaDestino | null })}
                disabled={disabled}
              >
                <option value="">— sin definir —</option>
                {BATERIA_DESTINO_OPCIONES.map((d) => (
                  <option key={d} value={d}>
                    {BATERIA_DESTINO_LABEL[d]}
                  </option>
                ))}
              </select>
            </div>
            {campoCantidad("Cant. de baterías")}
            {campoTipo}
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
              <label style={{ fontSize: 11 }}>
                Vinculado a <span className="opt">(rectificador/UPS del sitio)</span>
              </label>
              <select
                value={vinculada}
                onChange={(ev) => {
                  if (!ev.target.value) return onChange({ alimentadoPorTipo: null, alimentadoPorId: null });
                  const f = fuentes.find((x) => claveFuente(x.tipo, x.id) === ev.target.value);
                  if (f) onChange({ alimentadoPorTipo: f.tipo, alimentadoPorId: f.id, bateriaDestino: f.clase });
                }}
                disabled={disabled}
              >
                <option value="">{candidatas.length === 0 ? "— no hay en el sitio —" : "— sin vincular —"}</option>
                {!vinculadaEnLista && <option value={vinculada}>(vinculado a un equipo que ya no está en la lista)</option>}
                {candidatas.map((f) => (
                  <option key={claveFuente(f.tipo, f.id)} value={claveFuente(f.tipo, f.id)}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {rol === "ups" && (
          <>
            {campoPotencia}
            <div className="field" style={{ marginBottom: 0, width: 150 }}>
              <label style={{ fontSize: 11 }}>Baterías</label>
              <select
                value={datos.upsBaterias ?? ""}
                onChange={(ev) => onChange({ upsBaterias: (ev.target.value || null) as UpsBaterias | null })}
                disabled={disabled}
              >
                <option value="">— sin definir —</option>
                {UPS_BATERIAS_OPCIONES.map((u) => (
                  <option key={u} value={u}>
                    {UPS_BATERIAS_LABEL[u]}
                  </option>
                ))}
              </select>
            </div>
            {campoCantidad(datos.upsBaterias === "banco_externo" ? "Cant. propias" : "Baterías internas")}
            {campoTipo}
          </>
        )}
        {rol === "rectificador" && campoPotencia}
      </div>
      {datos.bateriaCantidad && datos.bateriaOrigen === "por_modelo" && (
        <div className="hint" style={{ color: "var(--warn)", margin: 0 }}>
          <Icon name="warning" size={12} /> La cantidad de baterías la dedujo la IA por el modelo — verificala en el equipo antes de guardar.
        </div>
      )}
      {datos.bateriaCantidad && datos.bateriaOrigen === "contadas" && (
        <div className="hint" style={{ margin: 0 }}>
          La IA contó {datos.bateriaCantidad} batería{datos.bateriaCantidad === 1 ? "" : "s"} en la foto — confirmá que se vean todas.
        </div>
      )}
      {rol === "ups" && datos.upsBaterias === "banco_externo" && (
        <div className="hint" style={{ margin: 0 }}>
          Con banco externo: cargá el banco aparte (categoría Banco de baterías) y vinculalo a esta UPS.
        </div>
      )}
    </div>
  );
}
