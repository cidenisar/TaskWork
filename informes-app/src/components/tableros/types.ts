import type { TableroCategoriaEquipo, TableroEventoTipo, TableroTipo, TableroTipoCircuito } from "@/lib/database.types";

/** Máximo de fotos que se pueden mandar juntas a la lectura con IA de un tablero (distintos ángulos/secciones del mismo gabinete). */
export const TABLERO_FOTO_IA_MAX = 3;

export const TABLERO_TIPOS: TableroTipo[] = ["energia", "cctv", "control_acceso"];

export const TABLERO_TIPO_LABEL: Record<TableroTipo, string> = {
  energia: "Energía",
  cctv: "CCTV",
  control_acceso: "Control de Acceso",
};

/** Un tablero puede tener más de un subsistema presente (mixto) — junta las etiquetas para mostrar, ej. "Energía + CCTV". */
export function labelSubsistemas(subsistemas: TableroTipo[]): string {
  return subsistemas.map((s) => TABLERO_TIPO_LABEL[s]).join(" + ") || "—";
}

export function tieneSubsistema(subsistemas: TableroTipo[], sub: TableroTipo): boolean {
  return subsistemas.includes(sub);
}

export const TABLERO_EVENTO_TIPOS: TableroEventoTipo[] = ["medicion", "relevamiento"];

export const TABLERO_EVENTO_LABEL: Record<TableroEventoTipo, string> = {
  medicion: "Medición",
  relevamiento: "Relevamiento",
};

export const CATEGORIA_EQUIPO_OPCIONES: TableroCategoriaEquipo[] = [
  "termica",
  "disyuntor",
  "bornera",
  "bornera_fusible",
  "fuente_industrial",
  "ups_industrial",
  "bateria",
  "conversor_dc",
  "inyector_poe",
  "descargador_gaseoso",
  "camara",
  "lectora",
  "cerradura",
  "otro",
];

export const CATEGORIA_EQUIPO_LABEL: Record<TableroCategoriaEquipo, string> = {
  termica: "Térmica",
  disyuntor: "Disyuntor/Diferencial",
  bornera: "Bornera",
  bornera_fusible: "Bornera doble piso c/ fusible",
  fuente_industrial: "Fuente industrial",
  ups_industrial: "UPS industrial",
  bateria: "Batería",
  conversor_dc: "Conversor DC (24V→12V, etc.)",
  inyector_poe: "Inyector PoE",
  descargador_gaseoso: "Descargador gaseoso",
  camara: "Cámara",
  lectora: "Lectora de acceso",
  cerradura: "Cerradura eléctrica",
  otro: "Otro",
};

export const TIPO_CIRCUITO_OPCIONES: TableroTipoCircuito[] = ["220v_mono", "380v_tri", "24vdc", "12vdc", "na"];

export const TIPO_CIRCUITO_LABEL: Record<TableroTipoCircuito, string> = {
  "220v_mono": "220V monofásico",
  "380v_tri": "380V trifásico",
  "24vdc": "24V DC",
  "12vdc": "12V DC",
  na: "No aplica",
};

/** Solo térmicas/disyuntores llevan corriente de carga medible por fase. */
const CATEGORIAS_CON_CORRIENTE: TableroCategoriaEquipo[] = ["termica", "disyuntor"];

export function categoriaLlevaAmp(categoria: TableroCategoriaEquipo): boolean {
  return CATEGORIAS_CON_CORRIENTE.includes(categoria);
}

/**
 * Un tablero mixto puede tener térmicas (miden corriente) y cámaras (no) en
 * la misma visita — el gate de corriente por fase es por elemento, no por
 * tablero: solo térmica/disyuntor en un circuito AC (mono o trifásico),
 * y solo cuando la visita es de tipo Medición (un Relevamiento nunca mide).
 */
export function itemMideCorriente(
  categoria: TableroCategoriaEquipo,
  tipoCircuito: TableroTipoCircuito,
  tipoEvento: TableroEventoTipo,
): boolean {
  return tipoEvento === "medicion" && categoriaLlevaAmp(categoria) && (tipoCircuito === "220v_mono" || tipoCircuito === "380v_tri");
}

export const ESTADO_OPCIONES: Record<TableroCategoriaEquipo, string[]> = {
  termica: ["Cerrado", "Abierto", "Disparado"],
  disyuntor: ["Cerrado", "Abierto", "Disparado"],
  bornera: ["OK", "Revisar"],
  bornera_fusible: ["OK", "Fusible quemado", "Revisar"],
  fuente_industrial: ["Funciona", "No funciona", "Revisar"],
  ups_industrial: ["Funciona", "No funciona", "Revisar"],
  bateria: ["OK", "A reemplazar", "Revisar"],
  conversor_dc: ["Funciona", "No funciona", "Revisar"],
  inyector_poe: ["Funciona", "No funciona", "Revisar"],
  descargador_gaseoso: ["OK", "A reemplazar", "Revisar"],
  camara: ["Funciona", "No funciona", "Revisar"],
  lectora: ["Funciona", "No funciona", "Revisar"],
  cerradura: ["Funciona", "No funciona", "Revisar"],
  otro: ["OK", "Revisar"],
};

export interface CircuitoItem {
  /** null = circuito nuevo, todavía no existe en tablero_circuitos. */
  id: string | null;
  numero: number;
  texto: string;
  ampNominal: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  /**
   * Solo transitorio en el form (no se persiste): true cuando lo cargó la
   * lectura de foto con IA sin encontrar una etiqueta legible, así el
   * técnico sabe que el texto es una descripción visual y conviene
   * verificarlo/corregirlo antes de guardar.
   */
  revisar?: boolean;
}

export interface TableroConCircuitos {
  id: string;
  subsistemas: TableroTipo[];
  denominacion: string;
  sitio: string;
  circuitos: CircuitoItem[];
}

export interface MantenimientoRow {
  id: string;
  tableroId: string;
  tableroDenominacion: string;
  tableroSitio: string;
  circuitoTexto: string | null;
  fecha: string;
  descripcion: string;
  fotoUrl: string | null;
  proximoMantenimiento: string | null;
}

export interface LecturaForm {
  circuitoId: string | null;
  numero: number;
  texto: string;
  ampNominal: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  estado: string;
  corrienteF: string;
  corrienteR: string;
  corrienteS: string;
  corrienteT: string;
  comentario: string;
}

/** Resumen del equipamiento relevado — se muestra en pantalla mientras se carga y se imprime en el PDF. */
export interface ResumenEquipamiento {
  total: number;
  circuitos220vMono: number;
  circuitos380vTri: number;
  porCategoria: { categoria: TableroCategoriaEquipo; cantidad: number }[];
}

export function calcularResumenEquipamiento(
  items: { categoriaEquipo: TableroCategoriaEquipo; tipoCircuito: TableroTipoCircuito }[],
): ResumenEquipamiento {
  const porCategoriaMap = new Map<TableroCategoriaEquipo, number>();
  let circuitos220vMono = 0;
  let circuitos380vTri = 0;
  for (const it of items) {
    porCategoriaMap.set(it.categoriaEquipo, (porCategoriaMap.get(it.categoriaEquipo) ?? 0) + 1);
    if (it.tipoCircuito === "220v_mono") circuitos220vMono++;
    if (it.tipoCircuito === "380v_tri") circuitos380vTri++;
  }
  const porCategoria = CATEGORIA_EQUIPO_OPCIONES.map((categoria) => ({ categoria, cantidad: porCategoriaMap.get(categoria) ?? 0 }))
    .filter((c) => c.cantidad > 0)
    .sort((a, b) => b.cantidad - a.cantidad);
  return { total: items.length, circuitos220vMono, circuitos380vTri, porCategoria };
}
