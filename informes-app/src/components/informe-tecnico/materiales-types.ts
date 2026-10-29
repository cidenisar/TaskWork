import type { EquipoCategoria, TipoEquipoBaja } from "@/lib/database.types";

/** Fotos de materiales/equipos que se mandan juntas a la IA en una sola lectura (mismo criterio que Equipos Individuales). */
export const MATERIAL_FOTO_IA_MAX = 10;

/** Fotos del remito (puede tener varias páginas, o convenir reintentar una que salió borrosa) — se mandan todas juntas a la IA en una sola lectura. */
export const REMITO_FOTO_MAX = 8;

/**
 * Categorías que existen TANTO en equipos sueltos (`EquipoCategoria`) como
 * dentro de un rack (`RackCategoriaEquipo`) — ahí es donde tiene sentido
 * preguntar "¿va dentro de un rack ya registrado?", para no terminar con el
 * mismo switch/UPS duplicado en `equipos` Y en `rack_equipamientos`. "otro"
 * queda afuera a propósito: es demasiado genérica, preguntaría de más.
 */
export const CATEGORIAS_POSIBLES_EN_RACK: EquipoCategoria[] = ["switch", "ups", "banco_baterias"];

export interface MaterialInformeItem {
  categoriaEquipo: EquipoCategoria;
  descripcion: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  comentario: string;
  revisar: boolean;
  /** Si está elegido, el alta va a `rack_equipamientos` (en ese rack) en vez de a `equipos` — ver CATEGORIAS_POSIBLES_EN_RACK. */
  rackId: string | null;
  /** Si está elegido, este material reemplaza al equipo indicado — dispara la baja automática del viejo al guardar. */
  reemplazaEquipoId: string | null;
  reemplazaTipo: TipoEquipoBaja | null;
  /** Solo para mostrar en el picker ya elegido, sin tener que re-resolver. */
  reemplazaTexto: string | null;
  /** Foto puntual (ya redimensionada a JPEG) cargada cuando "Verificar instalación" no encontró este material en las fotos generales. */
  fotoConfirmacion: Blob | null;
}

export const MATERIAL_INFORME_BASE: Omit<MaterialInformeItem, "descripcion" | "revisar"> = {
  categoriaEquipo: "otro",
  marcaModelo: "",
  numeroSerie: "",
  etiquetaYpf: "",
  cantidad: 1,
  consumoPromedioW: null,
  consumoMaxW: null,
  comentario: "",
  rackId: null,
  reemplazaEquipoId: null,
  reemplazaTipo: null,
  reemplazaTexto: null,
  fotoConfirmacion: null,
};

/**
 * Una línea del remito leída por IA (o cargada a mano): lo que el depósito
 * dice que se entregó. `cantidadSobrante` arranca en 0 — se ajusta si parte
 * (o todo) de esa línea no se usó/instaló; lo que quede con sobrante > 0 se
 * convierte en la devolución automática a depósito al guardar el informe.
 */
export interface RemitoItem {
  descripcion: string;
  cantidadEsperada: number;
  cantidadSobrante: number;
  /** Foto puntual (ya redimensionada a JPEG) cargada cuando "Verificar instalación" no encontró este material en las fotos generales. */
  fotoConfirmacion: Blob | null;
}
