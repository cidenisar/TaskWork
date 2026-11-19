import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TipoFuenteBateria } from "@/lib/database.types";
import { labelUbicacion } from "@/components/ubicaciones/types";
import { CATEGORIA_EQUIPO_LABEL as LABEL_EQUIPO } from "@/components/equipos/types";
import { CATEGORIA_EQUIPO_LABEL as LABEL_RACK } from "@/components/racks/types";
import { columnasADatosBateria, rolBateria, totalBaterias, type DatosBateria, type RolBateria } from "./types";

export interface FilaBateria {
  tipo: TipoFuenteBateria;
  id: string;
  categoria: string;
  categoriaLabel: string;
  rol: RolBateria;
  texto: string;
  marcaModelo: string;
  /** Unidades del equipo (los datos de baterías son por unidad). */
  cantidad: number;
  datos: DatosBateria;
  /** Baterías en total: unidades × baterías por unidad. Null si no se sabe cuántas lleva. */
  total: number | null;
  ubicacionId: string;
  sitio: string;
  /** Solo en componentes de rack. */
  rack: string | null;
  /** Texto del rectificador/UPS al que está vinculado un banco. */
  vinculadoA: string | null;
}

const COLUMNAS_BATERIA =
  "bateria_destino, bateria_cantidad, bateria_origen, bateria_tipo, ups_baterias, potencia_nominal, alimentado_por_tipo, alimentado_por_id";

type Cliente = SupabaseClient<Database>;

/**
 * Todos los bancos de baterías, UPS y rectificadores activos — sueltos y de
 * rack — con lo que se sabe de sus baterías, para planificar cuántas hay que
 * cambiar. Las consultas van separadas (los tipos no tienen relaciones) y por
 * tandas de ids para no pasar el límite de largo de la URL.
 */
export async function cargarBaterias(supabase: Cliente): Promise<FilaBateria[]> {
  const [equiposRes, racksRes] = await Promise.all([
    supabase
      .from("equipos")
      .select(`id, categoria_equipo, texto, marca_modelo, cantidad, ubicacion_id, ${COLUMNAS_BATERIA}`)
      .eq("estado", "activo")
      .in("categoria_equipo", ["ups", "fuente", "banco_baterias"])
      .limit(1000),
    supabase.from("racks").select("id, denominacion, ubicacion_id"),
  ]);
  const racks = racksRes.data ?? [];
  const rackPorId = new Map(racks.map((r) => [r.id, r]));

  const enRacks: NonNullable<Awaited<ReturnType<typeof consultarRackEquipamientos>>> = [];
  for (let i = 0; i < racks.length; i += 100) {
    const lote = racks.slice(i, i + 100).map((r) => r.id);
    const data = await consultarRackEquipamientos(supabase, lote);
    if (data) enRacks.push(...data);
  }

  const equipos = equiposRes.data ?? [];
  const ubicacionIds = [...new Set([...equipos.map((e) => e.ubicacion_id), ...racks.map((r) => r.ubicacion_id)])];
  const ubicaciones = new Map<string, string>();
  for (let i = 0; i < ubicacionIds.length; i += 100) {
    const { data } = await supabase.from("ubicaciones").select("*").in("id", ubicacionIds.slice(i, i + 100));
    for (const u of data ?? []) ubicaciones.set(u.id, labelUbicacion(u) || u.sitio);
  }

  const filas: FilaBateria[] = [];
  for (const e of equipos) {
    const rol = rolBateria(e.categoria_equipo);
    if (!rol) continue;
    filas.push({
      tipo: "equipo_individual",
      id: e.id,
      categoria: e.categoria_equipo,
      categoriaLabel: LABEL_EQUIPO[e.categoria_equipo],
      rol,
      texto: e.texto,
      marcaModelo: e.marca_modelo ?? "",
      cantidad: e.cantidad,
      datos: columnasADatosBateria(e),
      total: totalBaterias(e.cantidad, e.bateria_cantidad),
      ubicacionId: e.ubicacion_id,
      sitio: ubicaciones.get(e.ubicacion_id) ?? "—",
      rack: null,
      vinculadoA: null,
    });
  }
  for (const e of enRacks) {
    const rol = rolBateria(e.categoria_equipo);
    const rack = rackPorId.get(e.rack_id);
    if (!rol || !rack) continue;
    filas.push({
      tipo: "rack_equipamiento",
      id: e.id,
      categoria: e.categoria_equipo,
      categoriaLabel: LABEL_RACK[e.categoria_equipo],
      rol,
      texto: e.texto,
      marcaModelo: e.marca_modelo ?? "",
      cantidad: e.cantidad,
      datos: columnasADatosBateria(e),
      total: totalBaterias(e.cantidad, e.bateria_cantidad),
      ubicacionId: rack.ubicacion_id,
      sitio: ubicaciones.get(rack.ubicacion_id) ?? "—",
      rack: rack.denominacion,
      vinculadoA: null,
    });
  }

  // A cada banco, el nombre del rectificador/UPS al que está vinculado (esté donde esté).
  const textoPorClave = new Map(filas.map((f) => [`${f.tipo}:${f.id}`, f.texto]));
  for (const f of filas) {
    if (f.datos.alimentadoPorTipo && f.datos.alimentadoPorId) {
      f.vinculadoA = textoPorClave.get(`${f.datos.alimentadoPorTipo}:${f.datos.alimentadoPorId}`) ?? "(equipo que ya no está activo)";
    }
  }
  return filas.sort((a, b) => a.sitio.localeCompare(b.sitio) || a.texto.localeCompare(b.texto));
}

function consultarRackEquipamientos(supabase: Cliente, rackIds: string[]) {
  return supabase
    .from("rack_equipamientos")
    .select(`id, rack_id, categoria_equipo, texto, marca_modelo, cantidad, ${COLUMNAS_BATERIA}`)
    .eq("estado", "activo")
    .in("categoria_equipo", ["ups", "rectificador", "banco_baterias"])
    .in("rack_id", rackIds)
    .then((r) => r.data);
}

export interface ResumenBaterias {
  /** Baterías en total entre todo lo que tiene la cantidad cargada. */
  totalBaterias: number;
  bancos: number;
  upsConBaterias: number;
  /** Bancos y UPS a los que todavía no se les cargó cuántas baterías llevan. */
  sinCantidad: number;
  /** Bancos sin vincular a un rectificador/UPS. */
  bancosSinVincular: number;
  /** Total de baterías por tipo (ej. "12 V 150 Ah"), para saber qué comprar. */
  porTipo: { tipo: string; total: number }[];
}

export function resumirBaterias(filas: FilaBateria[]): ResumenBaterias {
  let total = 0;
  let bancos = 0;
  let upsConBaterias = 0;
  let sinCantidad = 0;
  let bancosSinVincular = 0;
  const porTipoMap = new Map<string, number>();
  for (const f of filas) {
    if (f.rol === "rectificador") continue;
    if (f.rol === "banco") {
      bancos += f.cantidad > 0 ? f.cantidad : 1;
      if (!f.datos.alimentadoPorId) bancosSinVincular++;
    }
    if (f.rol === "ups" && f.total) upsConBaterias++;
    if (f.total) {
      total += f.total;
      const tipo = f.datos.bateriaTipo.trim().replace(/\s+/g, " ") || "Sin especificar";
      porTipoMap.set(tipo, (porTipoMap.get(tipo) ?? 0) + f.total);
    } else if (f.rol === "banco" || (f.rol === "ups" && f.datos.upsBaterias !== "banco_externo")) {
      sinCantidad++;
    }
  }
  const porTipo = [...porTipoMap.entries()].map(([tipo, t]) => ({ tipo, total: t })).sort((a, b) => b.total - a.total);
  return { totalBaterias: total, bancos, upsConBaterias, sinCantidad, bancosSinVincular, porTipo };
}
