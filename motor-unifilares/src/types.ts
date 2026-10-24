/**
 * Tipos portados de informes-app (src/lib/tableros/unifilar.ts y
 * src/lib/database.types.ts) — copiados a propósito, no importados entre
 * apps: motor-unifilares es un servicio aparte, con su propio deploy, que
 * informes-app llama por HTTP. Si el modelo de datos de informes-app
 * cambia, este archivo se actualiza a mano (es la única fuente de verdad
 * de la forma que espera este servicio).
 */

export type TableroCategoriaEquipo =
  | "termica"
  | "disyuntor"
  | "bornera"
  | "bornera_fusible"
  | "fuente_industrial"
  | "ups_industrial"
  | "bateria"
  | "conversor_dc"
  | "inyector_poe"
  | "descargador_gaseoso"
  | "camara"
  | "lectora"
  | "cerradura"
  | "otro";

export type TableroTipoCircuito = "220v_mono" | "380v_tri" | "24vdc" | "12vdc" | "na";

export type TableroRolBypassUps = "entrada" | "bypass" | "salida";

export interface UnifilarCircuito {
  numero: number;
  texto: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  ampNominal: string | null;
  cuerpo: string | null;
  alimentadoPorUps: boolean;
  rolBypassUps: TableroRolBypassUps | null;
  /** N° de otro circuito del mismo cuerpo del que "cuelga" este — null si es la cabeza de su propia columna. */
  padreNumero: number | null;
  etiquetaCable: string | null;
}

/** Datos del cuadro de título (rótulo) al pie de cada hoja — vienen todos de la medición, el motor nunca inventa ninguno. */
export interface RotuloUnifilar {
  sitio: string;
  tablero: string;
  cliente: string;
  contratista: string;
  fecha: string;
  realizo: string;
  numeroGeneracion: string;
}

export const CAPAS_DXF = [
  "MARCO",
  "POTENCIA",
  "SIMBOLOS",
  "BORNES",
  "NUM_CONDUCTOR",
  "CABLES",
  "ETIQUETAS",
  "DESTINOS",
  "A_CONFIRMAR",
] as const;

export type CapaDxf = (typeof CAPAS_DXF)[number];

export type DrawCommand =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; layer: CapaDxf }
  | { type: "rect"; x: number; y: number; width: number; height: number; layer: CapaDxf; fill?: boolean }
  | { type: "circle"; x: number; y: number; r: number; layer: CapaDxf }
  | { type: "text"; x: number; y: number; text: string; size: number; bold?: boolean; layer: CapaDxf }
  | { type: "ellipse"; x: number; y: number; rx: number; ry: number; layer: CapaDxf };

export interface UnifilarDrawing {
  commands: DrawCommand[];
  width: number;
  height: number;
}

/** Petición que recibe POST /api/unifilar. */
export interface PedidoUnifilar {
  circuitos: UnifilarCircuito[];
  rotulo: RotuloUnifilar;
}

/** Respuesta: los archivos en base64 — este servicio nunca sube nada a storage, eso lo hace quien lo llama. */
export interface RespuestaUnifilar {
  dxfBase64: string;
  pdfBase64: string;
}

/**
 * Un caso puntual "enseñado" a mano (ver scripts/ensenar.ts): un fragmento
 * de DrawCommand[] ya validado que muestra cómo dibujar algo específico
 * (un equipo nuevo, una conexión particular) que las reglas escritas no
 * cubren o no alcanzan a explicar bien con texto solo. Vive como JSON en
 * reglas/ejemplos/ y se suma al prompt junto con REGLAS_UNIFILAR.md.
 */
export interface Ejemplo {
  /** Identificador corto en snake_case — también el nombre del archivo. */
  tag: string;
  /** Cuándo el generador debe usar este ejemplo como referencia. */
  cuandoAplica: string;
  commands: DrawCommand[];
}
