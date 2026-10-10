import { createServiceRoleClient } from "@/lib/supabase/server";
import { CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";
import { CATEGORIA_EQUIPO_LABEL as EQUIPO_CATEGORIA_LABEL } from "@/components/equipos/types";
import { CATEGORIA_EQUIPO_LABEL as TABLERO_CATEGORIA_LABEL } from "@/components/tableros/types";
import type { TipoEquipoBaja } from "@/lib/database.types";

export interface EquipoResuelto {
  texto: string;
  categoriaLabel: string;
  marcaModelo: string | null;
  numeroSerie: string | null;
  etiquetaYpf: string | null;
  ubicacionId: string;
  estadoActual: string;
}

export const TABLA_POR_TIPO: Record<TipoEquipoBaja, "tablero_circuitos" | "rack_equipamientos" | "equipos"> = {
  tablero_circuito: "tablero_circuitos",
  rack_equipamiento: "rack_equipamientos",
  equipo_individual: "equipos",
};

/**
 * Los 3 tipos de equipamiento viven en tablas distintas, con columnas
 * distintas (ej. tablero_circuitos no tiene marca/modelo ni serie) y
 * `ubicacion_id` resuelto distinto (directo en `equipos`, vía
 * `racks`/`tableros` en los otros dos) — se normaliza una sola vez acá para
 * que el resto de cada action sea genérico. Compartido entre "Bajas de
 * Equipamiento" y "Entregas a Depósito" (mismo `TipoEquipoBaja`, reusado
 * a propósito en vez de duplicar el tipo).
 */
export async function resolverEquipo(
  service: ReturnType<typeof createServiceRoleClient>,
  tipoEquipo: TipoEquipoBaja,
  equipoId: string,
): Promise<EquipoResuelto | null> {
  if (tipoEquipo === "tablero_circuito") {
    const { data: circuito } = await service
      .from("tablero_circuitos")
      .select("texto, categoria_equipo, estado, tablero_id")
      .eq("id", equipoId)
      .single();
    if (!circuito) return null;
    const { data: tablero } = await service.from("tableros").select("ubicacion_id").eq("id", circuito.tablero_id).single();
    if (!tablero) return null;
    return {
      texto: circuito.texto,
      categoriaLabel: TABLERO_CATEGORIA_LABEL[circuito.categoria_equipo],
      marcaModelo: null,
      numeroSerie: null,
      etiquetaYpf: null,
      ubicacionId: tablero.ubicacion_id,
      estadoActual: circuito.estado,
    };
  }
  if (tipoEquipo === "rack_equipamiento") {
    const { data: item } = await service
      .from("rack_equipamientos")
      .select("texto, categoria_equipo, marca_modelo, etiqueta_ypf, estado, rack_id")
      .eq("id", equipoId)
      .single();
    if (!item) return null;
    const { data: rack } = await service.from("racks").select("ubicacion_id").eq("id", item.rack_id).single();
    if (!rack) return null;
    return {
      texto: item.texto,
      categoriaLabel: RACK_CATEGORIA_LABEL[item.categoria_equipo],
      marcaModelo: item.marca_modelo,
      numeroSerie: null,
      etiquetaYpf: item.etiqueta_ypf,
      ubicacionId: rack.ubicacion_id,
      estadoActual: item.estado,
    };
  }
  const { data: item } = await service
    .from("equipos")
    .select("texto, categoria_equipo, marca_modelo, numero_serie, etiqueta_ypf, estado, ubicacion_id")
    .eq("id", equipoId)
    .single();
  if (!item) return null;
  return {
    texto: item.texto,
    categoriaLabel: EQUIPO_CATEGORIA_LABEL[item.categoria_equipo],
    marcaModelo: item.marca_modelo,
    numeroSerie: item.numero_serie,
    etiquetaYpf: item.etiqueta_ypf,
    ubicacionId: item.ubicacion_id,
    estadoActual: item.estado,
  };
}
