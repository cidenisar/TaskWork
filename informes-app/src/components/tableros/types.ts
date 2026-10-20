import type {
  TableroCategoriaEquipo,
  TableroEventoTipo,
  TableroJerarquia,
  TableroRolBypassUps,
  TableroTipo,
  TableroTipoCircuito,
} from "@/lib/database.types";

/**
 * Máximo de fotos que se pueden mandar juntas a la lectura con IA de un
 * tablero (distintos ángulos/secciones del mismo gabinete). Un tablero con
 * varios cuerpos (ver campo `cuerpo` de `CircuitoItem`) necesita varias
 * fotos por cuerpo para cubrirlo entero, no solo una del conjunto — mismo
 * techo que Racks/Torres (`RACK_FOTO_IA_MAX`/`TORRE_FOTO_IA_MAX`), que ya
 * tienen el mismo problema de "contenedor con varias secciones".
 */
export const TABLERO_FOTO_IA_MAX = 14;

/** Máximo de fotos generales que se guardan como evidencia de una visita (una por cuerpo, u otros ángulos de detalle). */
export const TABLERO_FOTO_GENERAL_MAX = 4;

export const TABLERO_JERARQUIA_OPCIONES: TableroJerarquia[] = ["principal", "secundario"];

export const TABLERO_JERARQUIA_LABEL: Record<TableroJerarquia, string> = {
  principal: "Principal",
  secundario: "Secundario",
};

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

/**
 * Subconjunto de categorías para el checklist de "equipamiento esperado"
 * del tablero (se carga una vez al dar de alta, antes de las fotos) — deja
 * afuera térmica/disyuntor/bornera/bornera_fusible (están en básicamente
 * todos los tableros, no aportan como checklist) y cámara/lectora/
 * cerradura (ya cubiertas por el subsistema CCTV/Control de Acceso).
 */
export const TABLERO_EQUIPO_ESPERADO_OPCIONES: TableroCategoriaEquipo[] = [
  "fuente_industrial",
  "ups_industrial",
  "bateria",
  "conversor_dc",
  "descargador_gaseoso",
  "inyector_poe",
];

export const TIPO_CIRCUITO_OPCIONES: TableroTipoCircuito[] = ["220v_mono", "380v_tri", "24vdc", "12vdc", "na"];

export const TIPO_CIRCUITO_LABEL: Record<TableroTipoCircuito, string> = {
  "220v_mono": "220V monofásico",
  "380v_tri": "380V trifásico",
  "24vdc": "24V DC",
  "12vdc": "12V DC",
  na: "No aplica",
};

/**
 * Rol en el bypass manual de un UPS: las 3 térmicas con la misma
 * denominación (entrada UPS, bypass, salida UPS) que permiten sacar el UPS
 * de servicio sin cortar los equipos aguas abajo (se baja entrada+salida,
 * se sube bypass). Solo tiene sentido en térmicas/disyuntores — no es lo
 * mismo que `alimentadoPorUps` (que marca un circuito de carga, aguas abajo
 * de la salida del UPS, como "circuito de UPS" en vez de "circuito normal").
 */
export const ROL_BYPASS_UPS_OPCIONES: TableroRolBypassUps[] = ["entrada", "bypass", "salida"];

export const ROL_BYPASS_UPS_LABEL: Record<TableroRolBypassUps, string> = {
  entrada: "Entrada UPS",
  bypass: "Bypass",
  salida: "Salida UPS",
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

/**
 * Qué cuadros de corriente mostrar/imprimir según el tipo de circuito — un
 * monofásico (220V) es una sola lectura ("F"), un trifásico (380V,
 * tetrapolar) son las tres fases ("R", "S", "T"), nunca los cuatro juntos.
 */
export function fasesMedicion(tipoCircuito: TableroTipoCircuito): readonly ("F" | "R" | "S" | "T")[] {
  if (tipoCircuito === "220v_mono") return ["F"];
  if (tipoCircuito === "380v_tri") return ["R", "S", "T"];
  return [];
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
   * Cuerpo físico del tablero (gabinete/puerta) al que pertenece este
   * circuito — un tablero con varios cuerpos tiene contenido y fecha de
   * visita distintos por cuerpo. Solo se puede cargar al dar de alta el
   * circuito, igual criterio que el resto de los campos de alta.
   */
  cuerpo: string;
  /**
   * true = circuito de carga alimentado por la salida del UPS ("circuito de
   * UPS"), en vez de un circuito normal (mains directo) — ver también
   * `rolBypassUps` para las térmicas del bypass del UPS en sí.
   */
  alimentadoPorUps: boolean;
  /** Solo para las 3 térmicas del bypass manual de un UPS — ver ROL_BYPASS_UPS_LABEL. */
  rolBypassUps: TableroRolBypassUps | null;
  /**
   * N° de OTRO circuito de este mismo tablero del que "cuelga" este (ej. un
   * disyuntor diferencial que va pegado debajo de su térmica, en la misma
   * columna del plano) — null si este circuito es la cabeza de su propia
   * columna. Se guarda por N° (no por id) porque en el form un circuito
   * nuevo todavía no tiene id hasta guardar la medición completa.
   */
  padreNumero: number | null;
  /** Número/código de cable tal como lo usa el técnico en sus propios planos (ej. "A80") — texto libre, nunca autogenerado. */
  etiquetaCable: string;
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
  ubicacionId: string;
  ubicacionLabel: string;
  circuitos: CircuitoItem[];
  jerarquia?: TableroJerarquia | null;
  tableroPadreId?: string | null;
  /** Equipamiento especial que se sabe que tiene este tablero — ver TABLERO_EQUIPO_ESPERADO_OPCIONES. */
  equipamientoEsperado: TableroCategoriaEquipo[];
  /** true si el tablero tiene bypass manual de UPS (entrada/bypass/salida). */
  tieneBypassUps: boolean;
}

export interface MantenimientoRow {
  id: string;
  tableroId: string;
  tableroDenominacion: string;
  tableroUbicacion: string;
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

// Inspección IA (hallazgos evaluados contra el catálogo configurable del
// módulo, más allá de los circuitos) vive en src/lib/inspeccion-ia/types.ts
// — es compartida por los 4 módulos que usan identificación con IA.
