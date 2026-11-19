import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { rolBateria, type DatosBateria, type RolBateria } from "./types";

type Cliente = SupabaseClient<Database>;

/** Lo que ya se sabe de un modelo porque otro equipo del mismo modelo ya fue cargado. */
export interface DatosPrevios {
  bateriaCantidad: number | null;
  bateriaTipo: string;
  upsBaterias: "internas" | "banco_externo" | null;
  potenciaNominal: string;
  /** Texto del equipo de donde salieron, para decir de dónde se tomó. */
  deEquipo: string;
}

const CATEGORIAS_EQUIPO: Record<RolBateria, string[]> = { banco: ["banco_baterias"], ups: ["ups"], rectificador: ["fuente"] };
const CATEGORIAS_RACK: Record<RolBateria, string[]> = { banco: ["banco_baterias"], ups: ["ups"], rectificador: ["rectificador"] };

const COLUMNAS = "texto, bateria_cantidad, bateria_origen, bateria_tipo, ups_baterias, potencia_nominal, created_at";

/** Para comparar "igual, sin importar mayúsculas": escapa los comodines de ilike. */
const patronExacto = (s: string) => s.trim().replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Busca otro equipo ya cargado con el MISMO modelo (sin importar mayúsculas)
 * y la misma clase (UPS, banco, rectificador) y devuelve lo que ya se sabe de
 * sus baterías, así no hace falta buscarlo de nuevo ni gastar IA. Entre varios,
 * gana el dato más confiable (contado o cargado a mano antes que estimado) y,
 * a igual confianza, el más reciente.
 */
export async function buscarDatosPrevios(supabase: Cliente, categoria: string, marcaModelo: string): Promise<DatosPrevios | null> {
  const rol = rolBateria(categoria);
  const modelo = marcaModelo.trim();
  if (!rol || !modelo) return null;
  const patron = patronExacto(modelo);

  const [equipos, racks] = await Promise.all([
    supabase.from("equipos").select(COLUMNAS).ilike("marca_modelo", patron).in("categoria_equipo", CATEGORIAS_EQUIPO[rol] as never[]).limit(30),
    supabase.from("rack_equipamientos").select(COLUMNAS).ilike("marca_modelo", patron).in("categoria_equipo", CATEGORIAS_RACK[rol] as never[]).limit(30),
  ]);

  const candidatos = [...(equipos.data ?? []), ...(racks.data ?? [])].filter((c) =>
    rol === "rectificador" ? !!c.potencia_nominal : c.bateria_cantidad !== null,
  );
  if (candidatos.length === 0) return null;

  const confianza = (o: string | null) => (o === "por_modelo" ? 1 : 0);
  candidatos.sort((a, b) => confianza(a.bateria_origen) - confianza(b.bateria_origen) || b.created_at.localeCompare(a.created_at));
  const c = candidatos[0];
  return {
    bateriaCantidad: c.bateria_cantidad,
    bateriaTipo: c.bateria_tipo ?? "",
    upsBaterias: c.ups_baterias,
    potenciaNominal: c.potencia_nominal ?? "",
    deEquipo: c.texto,
  };
}

/**
 * Completa SOLO lo que falta (cantidad, tipo, modo de la UPS, potencia) con lo
 * ya cargado de ese mismo modelo. Lo que la foto ya leyó no se pisa. Lo que
 * viene de otro equipo queda marcado como estimado por modelo (a verificar).
 */
export async function completarConPrevios(supabase: Cliente, categoria: string, marcaModelo: string, datos: DatosBateria): Promise<DatosBateria> {
  const rol = rolBateria(categoria);
  if (!rol || !marcaModelo.trim()) return datos;
  const falta = !datos.bateriaCantidad || !datos.bateriaTipo.trim() || !datos.potenciaNominal.trim() || (rol === "ups" && !datos.upsBaterias);
  if (!falta) return datos;
  const previos = await buscarDatosPrevios(supabase, categoria, marcaModelo);
  if (!previos) return datos;

  const out = { ...datos };
  if (!out.bateriaCantidad && previos.bateriaCantidad && rol !== "rectificador") {
    out.bateriaCantidad = previos.bateriaCantidad;
    out.bateriaOrigen = "por_modelo";
  }
  if (!out.bateriaTipo.trim() && previos.bateriaTipo && rol !== "rectificador") out.bateriaTipo = previos.bateriaTipo;
  if (rol === "ups" && !out.upsBaterias && previos.upsBaterias) out.upsBaterias = previos.upsBaterias;
  if (!out.potenciaNominal.trim() && previos.potenciaNominal && rol !== "banco") out.potenciaNominal = previos.potenciaNominal;
  return out;
}
