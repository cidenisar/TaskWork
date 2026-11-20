import type { BateriaDestino, BateriaOrigen, TipoFuenteBateria, UpsBaterias } from "@/lib/database.types";

/** Qué papel juega un equipo en el tema baterías. Las otras categorías no llevan estos datos. */
export type RolBateria = "banco" | "ups" | "rectificador";

/**
 * Sirve para equipos sueltos (`equipos.categoria_equipo`: "fuente" es
 * Fuente/Rectificador) y para componentes de rack (`rectificador`).
 */
export function rolBateria(categoria: string): RolBateria | null {
  if (categoria === "banco_baterias") return "banco";
  if (categoria === "ups") return "ups";
  if (categoria === "rectificador" || categoria === "fuente") return "rectificador";
  return null;
}

export const BATERIA_DESTINO_OPCIONES: BateriaDestino[] = ["rectificador", "ups"];
export const BATERIA_DESTINO_LABEL: Record<BateriaDestino, string> = { rectificador: "Rectificador", ups: "UPS" };

export const UPS_BATERIAS_OPCIONES: UpsBaterias[] = ["internas", "banco_externo"];
export const UPS_BATERIAS_LABEL: Record<UpsBaterias, string> = { internas: "Baterías internas", banco_externo: "Con banco externo" };

export const BATERIA_ORIGEN_LABEL: Record<BateriaOrigen, string> = {
  contadas: "contadas en la foto",
  por_modelo: "estimadas por el modelo — verificar",
  manual: "cargadas a mano",
};

/** Datos de baterías de un equipo, en la forma que usan los formularios. */
export interface DatosBateria {
  /** Solo en bancos: si sirve a un rectificador o a una UPS. */
  bateriaDestino: BateriaDestino | null;
  /** Baterías POR UNIDAD (monoblocks/elementos del banco; en una UPS, las internas). */
  bateriaCantidad: number | null;
  bateriaOrigen: BateriaOrigen | null;
  /** Tensión/capacidad de cada batería, texto libre ("12 V 150 Ah"). */
  bateriaTipo: string;
  /** Solo en UPS. */
  upsBaterias: UpsBaterias | null;
  /** Potencia del rectificador o la UPS tal como figura ("10 kVA", "48 Vcc / 100 A"). */
  potenciaNominal: string;
  /** Vínculo del banco con el rectificador/UPS al que pertenece (ambos o ninguno). */
  alimentadoPorTipo: TipoFuenteBateria | null;
  alimentadoPorId: string | null;
}

export const DATOS_BATERIA_VACIOS: DatosBateria = {
  bateriaDestino: null,
  bateriaCantidad: null,
  bateriaOrigen: null,
  bateriaTipo: "",
  upsBaterias: null,
  potenciaNominal: "",
  alimentadoPorTipo: null,
  alimentadoPorId: null,
};

/** Columnas de la base (equipos y rack_equipamientos usan los mismos nombres). */
export interface ColumnasBateria {
  bateria_destino: BateriaDestino | null;
  bateria_cantidad: number | null;
  bateria_origen: BateriaOrigen | null;
  bateria_tipo: string | null;
  ups_baterias: UpsBaterias | null;
  potencia_nominal: string | null;
  alimentado_por_tipo: TipoFuenteBateria | null;
  alimentado_por_id: string | null;
}

function cantidadValida(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const entero = Math.round(n);
  return entero >= 1 && entero <= 1000 ? entero : null;
}

/**
 * Deja solo lo que corresponde al tipo de equipo (si alguien cambia la
 * categoría de "banco" a "otro" no queda un vínculo o una cantidad suelta)
 * y normaliza: texto recortado, cantidad entera, vínculo completo o nada.
 * Una cantidad sin origen se toma como cargada a mano.
 */
export function datosBateriaAColumnas(categoria: string, datos: DatosBateria): ColumnasBateria {
  const rol = rolBateria(categoria);
  const vacio: ColumnasBateria = {
    bateria_destino: null,
    bateria_cantidad: null,
    bateria_origen: null,
    bateria_tipo: null,
    ups_baterias: null,
    potencia_nominal: null,
    alimentado_por_tipo: null,
    alimentado_por_id: null,
  };
  if (!rol) return vacio;

  const out = { ...vacio };
  const potencia = datos.potenciaNominal.trim().slice(0, 60);
  if (rol === "ups" || rol === "rectificador") out.potencia_nominal = potencia || null;

  if (rol === "banco" || rol === "ups") {
    const cantidad = cantidadValida(datos.bateriaCantidad);
    out.bateria_cantidad = cantidad;
    out.bateria_origen = cantidad ? (datos.bateriaOrigen ?? "manual") : null;
    out.bateria_tipo = datos.bateriaTipo.trim().slice(0, 60) || null;
  }
  if (rol === "banco") {
    out.bateria_destino = datos.bateriaDestino;
    if (datos.alimentadoPorTipo && datos.alimentadoPorId) {
      out.alimentado_por_tipo = datos.alimentadoPorTipo;
      out.alimentado_por_id = datos.alimentadoPorId;
    }
  }
  if (rol === "ups") out.ups_baterias = datos.upsBaterias;
  return out;
}

export function columnasADatosBateria(row: Partial<ColumnasBateria>): DatosBateria {
  return {
    bateriaDestino: row.bateria_destino ?? null,
    bateriaCantidad: row.bateria_cantidad ?? null,
    bateriaOrigen: row.bateria_origen ?? null,
    bateriaTipo: row.bateria_tipo ?? "",
    upsBaterias: row.ups_baterias ?? null,
    potenciaNominal: row.potencia_nominal ?? "",
    alimentadoPorTipo: row.alimentado_por_tipo ?? null,
    alimentadoPorId: row.alimentado_por_id ?? null,
  };
}

/** Total de baterías de un renglón: unidades del equipo × baterías por unidad. Null si no se sabe cuántas lleva. */
export function totalBaterias(cantidadUnidades: number, bateriaCantidad: number | null): number | null {
  if (!bateriaCantidad) return null;
  const unidades = Number.isFinite(cantidadUnidades) && cantidadUnidades > 0 ? cantidadUnidades : 1;
  return unidades * bateriaCantidad;
}

/** Texto corto para mostrar en listas, vacío si el equipo no tiene datos de baterías. */
export function resumenBateria(categoria: string, cantidadUnidades: number, d: DatosBateria): string {
  const rol = rolBateria(categoria);
  if (!rol) return "";
  const partes: string[] = [];
  if (rol === "banco" && d.bateriaDestino) partes.push(`banco de ${BATERIA_DESTINO_LABEL[d.bateriaDestino]}`);
  if (rol === "ups" && d.upsBaterias) partes.push(UPS_BATERIAS_LABEL[d.upsBaterias].toLowerCase());
  const total = totalBaterias(cantidadUnidades, d.bateriaCantidad);
  if (total) {
    partes.push(`${total} batería${total === 1 ? "" : "s"}${d.bateriaTipo ? ` de ${d.bateriaTipo}` : ""}`);
  }
  if (d.potenciaNominal) partes.push(d.potenciaNominal);
  return partes.join(" · ");
}
