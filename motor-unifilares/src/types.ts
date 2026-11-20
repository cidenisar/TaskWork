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

/**
 * Símbolos de la librería (ver src/simbolos/) — nombre corto que la IA usa
 * en vez de dibujar la geometría de cero cada vez (ver DrawCommand,
 * variant "simbolo", y expandirSimbolos en src/simbolos/index.ts). La
 * lista de nombres válidos es dinámica (tabla motor_unifilares_simbolos,
 * crece sin necesitar un deploy — ver src/simbolos-store.ts), por eso no
 * es una unión literal fija: se valida en tiempo de generación contra lo
 * que haya en la base en ese momento, no en tiempo de compilación.
 */
export type NombreSimbolo = string;

export type DrawCommand =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; layer: CapaDxf }
  | { type: "rect"; x: number; y: number; width: number; height: number; layer: CapaDxf; fill?: boolean }
  | { type: "circle"; x: number; y: number; r: number; layer: CapaDxf }
  | { type: "text"; x: number; y: number; text: string; size: number; bold?: boolean; layer: CapaDxf }
  | { type: "ellipse"; x: number; y: number; rx: number; ry: number; layer: CapaDxf }
  | { type: "simbolo"; nombre: NombreSimbolo; x: number; y: number; layer: CapaDxf };

export interface UnifilarDrawing {
  commands: DrawCommand[];
  width: number;
  height: number;
}

/**
 * Petición que recibe POST /api/unifilar — ver README.md "Generación
 * asincrónica": este endpoint solo ENCOLA el pedido (tabla
 * motor_unifilares_jobs) y devuelve enseguida, no genera nada. `medicionId`
 * es el id de la fila de tablero_mediciones donde el worker (ver
 * scripts/procesar-cola.ts) va a escribir el resultado.
 */
export interface PedidoUnifilar {
  medicionId: string;
  circuitos: UnifilarCircuito[];
  rotulo: RotuloUnifilar;
}

/** Respuesta de POST /api/unifilar: el pedido quedó encolado, nada más. */
export interface RespuestaUnifilarEncolado {
  jobId: string;
}

export type EstadoJobUnifilar = "pendiente" | "generando" | "listo" | "error";

/** Un pedido encolado tal como lo procesa scripts/procesar-cola.ts. */
export interface JobUnifilar {
  id: string;
  medicionId: string;
  circuitos: UnifilarCircuito[];
  rotulo: RotuloUnifilar;
}

/**
 * Un símbolo de la librería (ver src/simbolos-store.ts y
 * src/dxf-import.ts) — geometría exacta, anclada con el centro horizontal
 * y el borde superior en (0,0) (mismo sistema que `dibujarTermica`/
 * `dibujarDisyuntor` tenían antes de migrarse a esta tabla). `ancho`/`alto`
 * son el tamaño real del símbolo en mm, para que el generador pueda
 * razonar el espacio antes de ubicarlo.
 */
export interface Simbolo {
  nombre: string;
  descripcion: string;
  commands: DrawCommand[];
  ancho: number;
  alto: number;
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
