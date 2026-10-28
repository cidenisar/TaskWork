/**
 * Tipos de la base de datos, escritos a mano siguiendo supabase/migrations/*.sql.
 * Cuando el proyecto de Supabase esté vinculado, se pueden regenerar con:
 *   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
 * (conservar los tipos de dominio de src/lib/types.ts, que son los que usa la UI).
 */

export type Rol = "tecnico" | "supervisor" | "admin";
export type EstadoInforme = "borrador" | "generado";
export type EstadoRendicion = "abierta" | "cerrada";
export type Moneda = "ARS" | "USD";
export type UmbralAviso = "20" | "50" | "100";
export type TableroTipo = "energia" | "cctv" | "control_acceso";
export type TableroEventoTipo = "medicion" | "relevamiento";
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
export type RackCategoriaEquipo =
  | "router"
  | "switch"
  | "servidor"
  | "rectificador"
  | "banco_baterias"
  | "ups"
  | "odf"
  | "patch_panel"
  | "radio_enlace"
  | "convertidor_medios"
  | "firewall"
  | "multiplexor"
  | "pdu_regleta"
  | "otro";
export type TorreComunicacionCategoriaEquipo =
  | "antena"
  | "radioenlace"
  | "antena_celular"
  | "baliza"
  | "pararrayos"
  | "cableado_feeder"
  | "otro";
export type EquipoCategoria =
  | "ups"
  | "banco_baterias"
  | "grupo_electrogeno"
  | "camara_cctv"
  | "control_acceso"
  | "impresora"
  | "telefonia"
  | "climatizacion"
  | "fuente"
  | "switch"
  | "otro";
export type EstadoEquipamiento = "activo" | "baja" | "en_deposito";
export type OrigenEntregaDeposito = "equipo_existente" | "material_libre";
export type CondicionMaterial = "nuevo" | "usado_funcional";
export type MotivoEntregaDeposito = "sobrante_obra" | "reemplazo_funcional" | "retorno_mantenimiento" | "otro";
export type MotivoBaja = "rotura" | "ampliacion" | "obsolescencia" | "otro";
export type TipoEquipoBaja = "tablero_circuito" | "rack_equipamiento" | "equipo_individual";
/**
 * Tipo propio del Plan de Mantenimiento — separado de `TipoEquipoBaja` a
 * propósito: una Sala no se "da de baja" ni se "entrega a depósito" como
 * una pieza suelta (eso es Bajas de Equipamiento/Entregas a Depósito, que
 * siguen usando solo `TipoEquipoBaja`), pero sí necesita entrar al Plan de
 * Mantenimiento igual que Racks y Equipos Individuales.
 */
export type TipoEquipoMantenimiento = "rack_equipamiento" | "equipo_individual" | "sala";
export type SalaTipoConstruccion = "sala_interior" | "shelter" | "container" | "otro";
/** Dónde está instalada una cámara/domo (Equipos Individuales) — determina junto con la altura qué recurso hace falta para el mantenimiento. */
export type TipoMontajeCamara = "torre" | "columna" | "poste" | "pared" | "techo" | "otro";
/** Nombre libre tomado de catalogo_tipos_recurso_altura — ya no es un enum fijo, un Admin puede agregar uno nuevo (ej. "Andamóvil"). */
export type RecursoAlturaMantenimiento = string;
export type TableroJerarquia = "principal" | "secundario";

/** Helper para darle a cada tabla la forma que espera postgrest-js (incluye Relationships). */
type Tbl<
  Row extends Record<string, unknown>,
  Insert extends Record<string, unknown>,
  Update extends Record<string, unknown>,
> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

export type ProfileRow = {
  id: string;
  email: string;
  nombre_completo: string;
  rol: Rol;
  torre: string | null;
  activo: boolean;
  telefono: string | null;
  foto_perfil_url: string | null;
  dni: string | null;
  dni_vencimiento: string | null;
  fecha_nacimiento: string | null;
  factor_sanguineo: string | null;
  licencia_conducir_vencimiento: string | null;
  email_alternativo: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_telefono: string | null;
  talla_camisa: string | null;
  talla_pantalon: string | null;
  talla_remera: string | null;
  talla_campera: string | null;
  talla_mameluco: string | null;
  talla_botines: string | null;
  created_at: string;
}

export type CatalogoTecnicoRow = {
  id: string;
  nombre_completo: string;
  torre: string | null;
  created_by: string | null;
  created_at: string;
}

export type CatalogoTorreRow = {
  id: string;
  nombre: string;
  created_at: string;
}

export type CatalogoClienteRow = {
  id: string;
  nombre: string;
  created_at: string;
}

export type CatalogoProvinciaRow = {
  id: string;
  nombre: string;
  region: string;
  created_at: string;
}

export type CatalogoTipoInformeRow = {
  id: string;
  nombre: string;
  created_at: string;
}

export type CatalogoCategoriaGastoRow = {
  id: string;
  nombre: string;
  created_at: string;
}

export type CatalogoVehiculoRow = {
  id: string;
  patente: string;
  marca_modelo: string | null;
  kilometraje_actual: number | null;
  vencimiento_tarjeta_verde: string | null;
  foto_tarjeta_verde_url: string | null;
  vencimiento_rto: string | null;
  foto_rto_url: string | null;
  /** Estado general (rayones/roturas) relevado con fotos al dar de alta el vehículo — null si se cargó por el alta manual o nunca se completó. */
  estado_alta: string | null;
  tiene_danios_alta: boolean | null;
  /** Galería completa de fotos del alta (todas las que se mandaron a leer con IA, no solo una representativa). */
  fotos_exterior_urls: string[] | null;
  fotos_interior_urls: string[] | null;
  created_at: string;
  updated_at: string;
}

export type VehiculoServiceRow = {
  id: string;
  vehiculo_id: string;
  fecha: string;
  kilometraje: number;
  foto_url: string | null;
  descripcion: string | null;
  created_by: string | null;
  created_at: string;
}

export type InformeTecnicoRow = {
  id: string;
  numero_generacion: string;
  titulo: string;
  fecha: string;
  cliente: string;
  proyecto: string;
  ticket_numero: string | null;
  permiso_trabajo: string | null;
  tipo_informe: string | null;
  provincia: string | null;
  ubicacion: string | null;
  ubicacion_id: string | null;
  descripcion_trabajo: string | null;
  tareas_pendientes: string | null;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  created_by: string;
  created_at: string;
  estado: EstadoInforme;
  remito_fotos_urls: string[] | null;
  remito_numero: string | null;
  entrega_deposito_numero_generacion: string | null;
}

export type InformeTecnicoAsignadoRow = {
  id: string;
  informe_id: string;
  tecnico_nombre: string;
  torre: string | null;
  es_tecnico_seguridad: boolean;
}

export type InformeVehiculoRow = {
  id: string;
  informe_id: string;
  patente: string;
  marca_modelo: string | null;
}

export type InformeImagenRow = {
  id: string;
  informe_id: string;
  url: string;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  tomada_en: string;
  orden: number;
}

export type RendicionGastosRow = {
  id: string;
  numero_generacion: string;
  motivo: string;
  fecha: string;
  proyecto_cliente: string | null;
  provincia: string | null;
  ubicacion_id: string | null;
  viatico_recibido: number;
  moneda: Moneda;
  pdf_url: string | null;
  created_by: string;
  created_at: string;
  estado: EstadoRendicion;
}

export type GastoRow = {
  id: string;
  rendicion_id: string;
  fecha: string;
  categoria: string;
  monto: number;
  descripcion: string | null;
  comprobante_url: string | null;
}

export type GastoTecnicoRow = {
  id: string;
  gasto_id: string;
  tecnico_nombre: string;
  torre: string | null;
}

export type ConfigEmailEnvioRow = {
  id: string;
  email: string;
  activo: boolean;
}

export type ConfigGeneralRow = {
  id: number;
  logo_empresa_url: string | null;
  /** Nombre de la empresa contratista (ej. "SONDA") — se usa, entre otros lugares, en el rótulo del esquema unifilar de Tableros. */
  nombre_empresa: string;
  auto_enviar_email: boolean;
  umbral_aviso_historial: UmbralAviso;
  recordatorio_semanal_archivo: boolean;
  resumen_semanal_ia: boolean;
  liberacion_automatica_activa: boolean;
  /** Supuestos para estimar cuántos técnicos hacen falta para cumplir el Plan de Mantenimiento (ver lib/panel/mantenimiento-dotacion.ts). */
  pdm_horas_por_dia: number;
  pdm_dias_habiles_anio: number;
  pdm_horas_por_visita: number;
  pdm_velocidad_kmh: number;
}

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_nombre: string;
  actor_rol: Rol;
  accion: string;
  created_at: string;
}

export type TableroRow = {
  id: string;
  subsistemas: TableroTipo[];
  denominacion: string;
  /** Cliente del tablero (ej. "YPF") — mismo catálogo compartido que Informe Técnico (catalogo_clientes), alta al vuelo. Se usa en el rótulo del esquema unifilar. */
  cliente: string;
  ubicacion_id: string;
  /** Principal/Secundario — null = sin clasificar. Base para sumar cargas de secundarios hacia su principal más adelante. */
  jerarquia: TableroJerarquia | null;
  /** El tablero del que "cuelga" este (puede ser un principal u OTRO secundario — una cadena). Solo tiene sentido cuando jerarquia='secundario'. */
  tablero_padre_id: string | null;
  /** Equipamiento especial que se sabe que tiene este tablero (fuente, UPS, conversor DC, etc.) — se carga una vez al dar de alta, no por visita. */
  equipamiento_esperado: TableroCategoriaEquipo[];
  /** true si el tablero tiene un bypass manual de UPS (3 térmicas: entrada/bypass/salida) — ver TableroRolBypassUps. */
  tiene_bypass_ups: boolean;
  created_by: string | null;
  created_at: string;
}

export type TableroCircuitoRow = {
  id: string;
  tablero_id: string;
  numero: number;
  texto: string;
  amp_nominal: string | null;
  categoria_equipo: TableroCategoriaEquipo;
  tipo_circuito: TableroTipoCircuito;
  orden: number;
  estado: EstadoEquipamiento;
  cuerpo: string | null;
  alimentado_por_ups: boolean;
  rol_bypass_ups: TableroRolBypassUps | null;
  circuito_padre_id: string | null;
  etiqueta_cable: string | null;
  created_at: string;
}

export type TableroMedicionRow = {
  id: string;
  tablero_id: string;
  numero_generacion: string;
  tipo_evento: TableroEventoTipo;
  fecha: string;
  created_by: string;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  foto_general_url: string | null;
  fotos_generales_urls: string[] | null;
  dxf_url: string | null;
  /** PDF A3 del unifilar generado por motor-unifilares — aparte de dxf_url (mismo generador) y pdf_url (informe de relevamiento normal). */
  unifilar_pdf_url: string | null;
  /** Estado de la generación asincrónica del unifilar (null = nunca se pidió) — ver unifilar-actions.ts y motor-unifilares/README.md. */
  unifilar_estado: "pendiente" | "generando" | "listo" | "error" | null;
  unifilar_error: string | null;
  created_at: string;
}

/** Archivo suelto adjuntado a un tablero (un unifilar propio, un PDF, una foto del gabinete) — aparte del unifilar en vivo y el DXF que ya genera "Nueva Medición". */
export type TableroAdjuntoRow = {
  id: string;
  tablero_id: string;
  nombre: string;
  archivo_url: string;
  created_by: string | null;
  created_at: string;
}

export type TableroMantenimientoRow = {
  id: string;
  tablero_id: string;
  circuito_id: string | null;
  fecha: string;
  descripcion: string;
  foto_url: string | null;
  proximo_mantenimiento: string | null;
  created_by: string;
  created_at: string;
}

export type TableroMedicionLecturaRow = {
  id: string;
  medicion_id: string;
  circuito_id: string;
  estado: string | null;
  corriente_f: number | null;
  corriente_r: number | null;
  corriente_s: number | null;
  corriente_t: number | null;
  comentario: string | null;
}

/** Qué módulo de relevamiento con IA tiene cargado este ítem/resultado de Inspección IA (ver ModuloInspeccionIa). */
export type ModuloInspeccionIa = "tableros" | "racks" | "equipos" | "torres" | "vehiculos" | "informe_tecnico";

/** Catálogo admin-configurable de qué revisar en las fotos de un módulo, además de lo que esa IA ya identifica (ver EstadoChecklist). */
export type CatalogoInspeccionIaRow = {
  id: string;
  modulo: ModuloInspeccionIa;
  orden: number;
  texto: string;
  created_by: string | null;
  created_at: string;
}

export type InspeccionIaHallazgoRow = {
  id: string;
  modulo: ModuloInspeccionIa;
  registro_id: string;
  item_id: string;
  estado: EstadoChecklist;
  comentario: string | null;
}

export type RackRow = {
  id: string;
  denominacion: string;
  /** Etiqueta/chapa de inventario de YPF del rack en sí (para ServiceNow) — distinta de la denominación. */
  etiqueta_ypf: string | null;
  ubicacion_id: string;
  created_by: string | null;
  created_at: string;
}

export type UbicacionRow = {
  id: string;
  pais: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  lat: number | null;
  lng: number | null;
  gps_accuracy_m: number | null;
  gps_confirmado_at: string | null;
  gps_confirmado_por: string | null;
  created_by: string | null;
  created_at: string;
}

export type RackEquipamientoRow = {
  id: string;
  rack_id: string;
  numero: number;
  categoria_equipo: RackCategoriaEquipo;
  texto: string;
  marca_modelo: string | null;
  posicion_u: string | null;
  cantidad: number;
  /** @deprecated reemplazada por consumo_promedio_w/consumo_max_w (20261005050000) */
  consumo_estimado_w: number | null;
  consumo_promedio_w: number | null;
  consumo_max_w: number | null;
  etiqueta_ypf: string | null;
  /** N° de serie de fábrica, distinto de etiqueta_ypf (chapa de inventario de YPF). */
  numero_serie: string | null;
  /** Puertos/bocas libres del equipo — manual, se completa al dar de alta. */
  bocas_disponibles: number | null;
  estado: EstadoEquipamiento;
  created_at: string;
}

export type RackRelevamientoRow = {
  id: string;
  rack_id: string;
  numero_generacion: string;
  fecha: string;
  created_by: string;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  fotos_generales_urls: string[] | null;
  created_at: string;
}

export type RackRelevamientoLecturaRow = {
  id: string;
  relevamiento_id: string;
  equipamiento_id: string;
  estado: string | null;
  comentario: string | null;
}

export type TorreTipo = "autosoportada" | "arriostrada" | "monopole" | "otro";

export type TorreComunicacionRow = {
  id: string;
  denominacion: string;
  /** Clasificación visual de la torre, para estimar altura por tramos — null si no se estimó. */
  tipo_torre: TorreTipo | null;
  /** Tramos (secciones modulares) contados en las fotos del relevamiento — null si no se estimó/no es confiable. */
  tramos_contados: number | null;
  /** tramos_contados × largo de tramo (torre_tipo_largos) — ESTIMADA, nunca una medición real; editable por el técnico. */
  altura_estimada_m: number | null;
  ubicacion_id: string;
  created_by: string | null;
  created_at: string;
}

/** Largo de tramo (m) estándar configurado por un Admin para cada tipo de torre — "otro" no aplica, no tiene largo estándar. */
export type TorreTipoLargoRow = {
  id: string;
  tipo_torre: TorreTipo;
  largo_tramo_m: number;
  updated_by: string | null;
  updated_at: string;
}

export type TorreComunicacionEquipamientoRow = {
  id: string;
  torre_id: string;
  numero: number;
  categoria_equipo: TorreComunicacionCategoriaEquipo;
  texto: string;
  marca_modelo: string | null;
  /** Altura en la torre, texto libre (ej. "24m") — no siempre se puede medir con precisión en el momento. */
  altura_m: string | null;
  etiqueta_ypf: string | null;
  cantidad: number;
  consumo_promedio_w: number | null;
  consumo_max_w: number | null;
  estado: EstadoEquipamiento;
  created_at: string;
}

export type TorreComunicacionRelevamientoRow = {
  id: string;
  torre_id: string;
  numero_generacion: string;
  fecha: string;
  created_by: string;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  fotos_generales_urls: string[] | null;
  created_at: string;
}

export type TorreComunicacionRelevamientoLecturaRow = {
  id: string;
  relevamiento_id: string;
  equipamiento_id: string;
  estado: string | null;
  comentario: string | null;
}

/**
 * Sala/shelter/container — el ambiente físico, no el equipamiento que
 * alberga. Alta única (sin tabla de relevamientos repetidos): las visitas
 * siguientes quedan en el Plan de Mantenimiento genérico (ver
 * MantenimientoEquipamientoRow con tipo_equipo='sala').
 */
export type SalaRow = {
  id: string;
  ubicacion_id: string;
  denominacion: string;
  tipo_construccion: SalaTipoConstruccion;
  estado: "activo" | "baja";
  numero_generacion: string;
  fotos_generales_urls: string[] | null;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  created_by: string;
  created_at: string;
}

export type EquipoRow = {
  id: string;
  ubicacion_id: string;
  categoria_equipo: EquipoCategoria;
  texto: string;
  marca_modelo: string | null;
  numero_serie: string | null;
  cantidad: number;
  /** @deprecated reemplazada por consumo_promedio_w/consumo_max_w (20261005050000) */
  consumo_estimado_w: number | null;
  consumo_promedio_w: number | null;
  consumo_max_w: number | null;
  etiqueta_ypf: string | null;
  estado: EstadoEquipamiento;
  /** Solo tiene sentido en categoria_equipo='camara_cctv' — en el resto queda null. */
  tipo_montaje: TipoMontajeCamara | null;
  altura_montaje_m: number | null;
  created_by: string | null;
  created_at: string;
}

/** Qué recurso hace falta para el mantenimiento según el tipo de montaje y la altura real — admin-configurable, nunca inventado por IA. */
export type CatalogoRecursoAlturaRow = {
  id: string;
  tipo_montaje: TipoMontajeCamara;
  recurso_fijo: RecursoAlturaMantenimiento | null;
  updated_by: string | null;
  updated_at: string;
}

/** Catálogo abierto de nombres de recurso (Escalera, Andamio/Manlift, Grupo de altura, Andamóvil, ...) — SimpleCatalogTab (id, nombre). */
export type CatalogoTipoRecursoAlturaRow = {
  id: string;
  nombre: string;
  created_at: string;
}

/** Banda "hasta tantos metros, tal recurso" por tipo de montaje — mismo criterio que catalogo_calibre_cable. */
export type CatalogoRecursoAlturaBandaRow = {
  id: string;
  tipo_montaje: TipoMontajeCamara;
  altura_hasta_m: number;
  recurso: string;
  created_by: string | null;
  created_at: string;
}

export type CatalogoCalibreCableRow = {
  id: string;
  amperaje_max: number;
  calibre_mm2: number;
  updated_by: string | null;
  updated_at: string;
}

export type EquipoRelevamientoRow = {
  id: string;
  ubicacion_id: string;
  numero_generacion: string;
  fecha: string;
  created_by: string;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  foto_general_url: string | null;
  created_at: string;
}

export type EquipoRelevamientoLecturaRow = {
  id: string;
  relevamiento_id: string;
  equipo_id: string;
  estado: string | null;
  comentario: string | null;
}

export type BajaEquipamientoRow = {
  id: string;
  numero_generacion: string;
  tipo_equipo: TipoEquipoBaja;
  equipo_id: string;
  equipo_texto: string;
  equipo_categoria: string;
  equipo_marca_modelo: string | null;
  equipo_numero_serie: string | null;
  equipo_etiqueta_ypf: string | null;
  ubicacion_id: string;
  motivo: MotivoBaja;
  comentario: string | null;
  fecha: string;
  created_by: string;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  /** Confirmación de que el equipo ya llegó físicamente al depósito — distinta de la baja en sí, puede pasar días/semanas después. */
  entregado_deposito_at: string | null;
  entregado_deposito_por: string | null;
  created_at: string;
}

export type EntregaDepositoRow = {
  id: string;
  numero_generacion: string;
  origen: OrigenEntregaDeposito;
  tipo_equipo: TipoEquipoBaja | null;
  equipo_id: string | null;
  descripcion: string;
  categoria: string | null;
  marca_modelo: string | null;
  numero_serie: string | null;
  etiqueta_ypf: string | null;
  cantidad: number;
  condicion: CondicionMaterial;
  motivo: MotivoEntregaDeposito;
  comentario: string | null;
  ubicacion_id: string;
  fecha: string;
  created_by: string;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  fotos_evidencia_urls: string[] | null;
  created_at: string;
}

/**
 * Tabla huérfana: resto del viejo módulo standalone "Instalación", plegado
 * después dentro de Informe Técnico (ver CRITERIOS_Y_IDEAS.md, sección 5).
 * El código ya no escribe ni lee acá — se tipa solo para que "Vaciar datos
 * de prueba" pueda borrar lo que haya quedado cargado de aquella época.
 */
export type InstalacionRow = {
  id: string;
  numero_generacion: string;
  ubicacion_id: string;
  fecha: string;
  descripcion: string;
  categoria: string | null;
  marca_modelo: string | null;
  numero_serie: string | null;
  etiqueta_ypf: string | null;
  cantidad: number;
  comentario: string | null;
  remito_foto_url: string | null;
  remito_numero: string | null;
  entrega_deposito_numero_generacion: string | null;
  created_by: string;
  pdf_url: string | null;
  pdf_generado_at: string | null;
  created_at: string;
}

/** Consumo real de tokens de una llamada a la IA — ver Configuración → Uso de IA. */
export type IaUsoRow = {
  id: string;
  endpoint: string;
  modulo: string;
  modelo: string;
  input_tokens: number;
  output_tokens: number;
  costo_estimado_usd: number;
  created_by: string;
  created_at: string;
}

/** Una lectura "detallada" de tablero con IA (ENCARGO.md lectura-fotos) — fotos + JSON crudo + revisado + costo, ver tableros/lecturas-ia. */
export type TableroLecturaIaRow = {
  id: string;
  tablero_id: string | null;
  medicion_id: string | null;
  fotos_urls: string[];
  modelo: string;
  input_tokens: number;
  output_tokens: number;
  costo_estimado_usd: number;
  json_crudo: Record<string, unknown>;
  circuitos_adaptados: unknown[];
  circuitos_revisados: unknown[] | null;
  porcentaje_acierto: number | null;
  created_by: string;
  revisor_id: string | null;
  created_at: string;
}

export type MantenimientoIntervaloRow = {
  id: string;
  tipo_equipo: TipoEquipoMantenimiento;
  /** Valor crudo del enum de categoría del tipo_equipo correspondiente (TableroCategoriaEquipo/RackCategoriaEquipo/EquipoCategoria). */
  categoria: string;
  frecuencia_dias: number;
  created_by: string | null;
  created_at: string;
}

export type MantenimientoEquipamientoRow = {
  id: string;
  tipo_equipo: TipoEquipoMantenimiento;
  equipo_id: string;
  fecha: string;
  descripcion: string | null;
  foto_url: string | null;
  created_by: string;
  created_at: string;
}

/** Catálogo de ítems de checklist por (tipo_equipo, categoria) — admin-configurable. */
export type MantenimientoChecklistItemRow = {
  id: string;
  tipo_equipo: TipoEquipoMantenimiento;
  categoria: string;
  orden: number;
  texto: string;
  created_by: string | null;
  created_at: string;
}

export type EstadoChecklist = "ok" | "no_ok" | "no_aplica";

/** Respuesta de un ítem de checklist, guardada junto al mantenimiento que la generó. */
export type MantenimientoChecklistRespuestaRow = {
  id: string;
  mantenimiento_id: string;
  item_id: string;
  estado: EstadoChecklist;
  observacion: string | null;
}

/** Programación manual de la próxima visita — pisa (para mostrar) la fecha calculada del intervalo cuando hace falta coordinar algo puntual. */
export type OrigenProgramacion = "manual" | "auto";

export type MotivoReprogramacionMantenimiento =
  | "clima"
  | "sitio_inaccesible"
  | "falta_repuesto"
  | "equipo_no_encontrado"
  | "seguridad_sitio"
  | "otro";

export type MantenimientoProgramacionRow = {
  id: string;
  tipo_equipo: TipoEquipoMantenimiento;
  equipo_id: string;
  fecha_programada: string;
  asignado_a: string | null;
  nota: string | null;
  /** Por qué se reprograma a mano (ej. el técnico llegó al sitio y no lo pudo hacer) — null si es solo una fecha anticipada o la generó el algoritmo. */
  motivo: MotivoReprogramacionMantenimiento | null;
  /** 'auto' = generada por el algoritmo (Configuración → Generar programación automática), nunca se pisa a mano; 'manual' = cargada por un técnico, el algoritmo nunca la toca. */
  origen: OrigenProgramacion;
  created_by: string;
  created_at: string;
}

export type InformeMaterialRow = {
  id: string;
  informe_id: string;
  categoria_equipo: EquipoCategoria;
  descripcion: string;
  marca_modelo: string | null;
  numero_serie: string | null;
  etiqueta_ypf: string | null;
  cantidad: number;
  consumo_promedio_w: number | null;
  consumo_max_w: number | null;
  comentario: string | null;
  equipo_id: string | null;
  created_at: string;
}

export type ClientErrorRow = {
  id: string;
  user_id: string | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
  contexto: string | null;
  mensaje: string;
  stack: string | null;
  url: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: Tbl<
        ProfileRow,
        Partial<ProfileRow> & Pick<ProfileRow, "id" | "email" | "nombre_completo">,
        Partial<ProfileRow>
      >;
      catalogo_tecnicos: Tbl<
        CatalogoTecnicoRow,
        Partial<CatalogoTecnicoRow> & Pick<CatalogoTecnicoRow, "nombre_completo">,
        Partial<CatalogoTecnicoRow>
      >;
      catalogo_torres: Tbl<
        CatalogoTorreRow,
        Partial<CatalogoTorreRow> & Pick<CatalogoTorreRow, "nombre">,
        Partial<CatalogoTorreRow>
      >;
      catalogo_clientes: Tbl<
        CatalogoClienteRow,
        Partial<CatalogoClienteRow> & Pick<CatalogoClienteRow, "nombre">,
        Partial<CatalogoClienteRow>
      >;
      catalogo_provincias: Tbl<
        CatalogoProvinciaRow,
        Partial<CatalogoProvinciaRow> & Pick<CatalogoProvinciaRow, "nombre" | "region">,
        Partial<CatalogoProvinciaRow>
      >;
      catalogo_tipos_informe: Tbl<
        CatalogoTipoInformeRow,
        Partial<CatalogoTipoInformeRow> & Pick<CatalogoTipoInformeRow, "nombre">,
        Partial<CatalogoTipoInformeRow>
      >;
      catalogo_categorias_gasto: Tbl<
        CatalogoCategoriaGastoRow,
        Partial<CatalogoCategoriaGastoRow> & Pick<CatalogoCategoriaGastoRow, "nombre">,
        Partial<CatalogoCategoriaGastoRow>
      >;
      catalogo_vehiculos: Tbl<
        CatalogoVehiculoRow,
        Partial<CatalogoVehiculoRow> & Pick<CatalogoVehiculoRow, "patente">,
        Partial<CatalogoVehiculoRow>
      >;
      vehiculo_services: Tbl<
        VehiculoServiceRow,
        Partial<VehiculoServiceRow> & Pick<VehiculoServiceRow, "vehiculo_id" | "fecha" | "kilometraje">,
        Partial<VehiculoServiceRow>
      >;
      informes_tecnicos: Tbl<
        InformeTecnicoRow,
        Partial<InformeTecnicoRow> &
          Pick<InformeTecnicoRow, "numero_generacion" | "titulo" | "fecha" | "cliente" | "proyecto" | "created_by">,
        Partial<InformeTecnicoRow>
      >;
      informe_tecnicos_asignados: Tbl<
        InformeTecnicoAsignadoRow,
        Partial<InformeTecnicoAsignadoRow> & Pick<InformeTecnicoAsignadoRow, "informe_id" | "tecnico_nombre">,
        Partial<InformeTecnicoAsignadoRow>
      >;
      informe_vehiculos: Tbl<
        InformeVehiculoRow,
        Partial<InformeVehiculoRow> & Pick<InformeVehiculoRow, "informe_id" | "patente">,
        Partial<InformeVehiculoRow>
      >;
      informe_imagenes: Tbl<
        InformeImagenRow,
        Partial<InformeImagenRow> & Pick<InformeImagenRow, "informe_id" | "url" | "tomada_en" | "orden">,
        Partial<InformeImagenRow>
      >;
      informe_materiales: Tbl<
        InformeMaterialRow,
        Partial<InformeMaterialRow> & Pick<InformeMaterialRow, "informe_id" | "categoria_equipo" | "descripcion">,
        Partial<InformeMaterialRow>
      >;
      rendiciones_gastos: Tbl<
        RendicionGastosRow,
        Partial<RendicionGastosRow> &
          Pick<RendicionGastosRow, "numero_generacion" | "motivo" | "fecha" | "viatico_recibido" | "created_by">,
        Partial<RendicionGastosRow>
      >;
      gastos: Tbl<
        GastoRow,
        Partial<GastoRow> & Pick<GastoRow, "rendicion_id" | "fecha" | "categoria" | "monto">,
        Partial<GastoRow>
      >;
      gasto_tecnicos: Tbl<
        GastoTecnicoRow,
        Partial<GastoTecnicoRow> & Pick<GastoTecnicoRow, "gasto_id" | "tecnico_nombre">,
        Partial<GastoTecnicoRow>
      >;
      config_emails_envio: Tbl<
        ConfigEmailEnvioRow,
        Partial<ConfigEmailEnvioRow> & Pick<ConfigEmailEnvioRow, "email">,
        Partial<ConfigEmailEnvioRow>
      >;
      config_general: Tbl<ConfigGeneralRow, Partial<ConfigGeneralRow>, Partial<ConfigGeneralRow>>;
      audit_log: Tbl<
        AuditLogRow,
        Partial<AuditLogRow> & Pick<AuditLogRow, "actor_nombre" | "actor_rol" | "accion">,
        Partial<AuditLogRow>
      >;
      client_errores: Tbl<ClientErrorRow, Partial<ClientErrorRow> & Pick<ClientErrorRow, "mensaje">, Partial<ClientErrorRow>>;
      tableros: Tbl<
        TableroRow,
        Partial<TableroRow> & Pick<TableroRow, "subsistemas" | "denominacion" | "ubicacion_id">,
        Partial<TableroRow>
      >;
      tablero_circuitos: Tbl<
        TableroCircuitoRow,
        Partial<TableroCircuitoRow> & Pick<TableroCircuitoRow, "tablero_id" | "numero" | "texto">,
        Partial<TableroCircuitoRow>
      >;
      tablero_mediciones: Tbl<
        TableroMedicionRow,
        Partial<TableroMedicionRow> &
          Pick<TableroMedicionRow, "tablero_id" | "numero_generacion" | "fecha" | "created_by">,
        Partial<TableroMedicionRow>
      >;
      tablero_medicion_lecturas: Tbl<
        TableroMedicionLecturaRow,
        Partial<TableroMedicionLecturaRow> & Pick<TableroMedicionLecturaRow, "medicion_id" | "circuito_id">,
        Partial<TableroMedicionLecturaRow>
      >;
      tablero_mantenimientos: Tbl<
        TableroMantenimientoRow,
        Partial<TableroMantenimientoRow> &
          Pick<TableroMantenimientoRow, "tablero_id" | "fecha" | "descripcion" | "created_by">,
        Partial<TableroMantenimientoRow>
      >;
      catalogo_inspeccion_ia: Tbl<
        CatalogoInspeccionIaRow,
        Partial<CatalogoInspeccionIaRow> & Pick<CatalogoInspeccionIaRow, "modulo" | "texto">,
        Partial<CatalogoInspeccionIaRow>
      >;
      inspeccion_ia_hallazgos: Tbl<
        InspeccionIaHallazgoRow,
        Partial<InspeccionIaHallazgoRow> & Pick<InspeccionIaHallazgoRow, "modulo" | "registro_id" | "item_id" | "estado">,
        Partial<InspeccionIaHallazgoRow>
      >;
      racks: Tbl<RackRow, Partial<RackRow> & Pick<RackRow, "denominacion" | "ubicacion_id">, Partial<RackRow>>;
      ubicaciones: Tbl<UbicacionRow, Partial<UbicacionRow> & Pick<UbicacionRow, "provincia" | "sitio">, Partial<UbicacionRow>>;
      rack_equipamientos: Tbl<
        RackEquipamientoRow,
        Partial<RackEquipamientoRow> & Pick<RackEquipamientoRow, "rack_id" | "numero" | "categoria_equipo" | "texto">,
        Partial<RackEquipamientoRow>
      >;
      rack_relevamientos: Tbl<
        RackRelevamientoRow,
        Partial<RackRelevamientoRow> & Pick<RackRelevamientoRow, "rack_id" | "numero_generacion" | "fecha" | "created_by">,
        Partial<RackRelevamientoRow>
      >;
      rack_relevamiento_lecturas: Tbl<
        RackRelevamientoLecturaRow,
        Partial<RackRelevamientoLecturaRow> & Pick<RackRelevamientoLecturaRow, "relevamiento_id" | "equipamiento_id">,
        Partial<RackRelevamientoLecturaRow>
      >;
      torres_comunicacion: Tbl<
        TorreComunicacionRow,
        Partial<TorreComunicacionRow> & Pick<TorreComunicacionRow, "denominacion" | "ubicacion_id">,
        Partial<TorreComunicacionRow>
      >;
      torre_comunicacion_equipamientos: Tbl<
        TorreComunicacionEquipamientoRow,
        Partial<TorreComunicacionEquipamientoRow> &
          Pick<TorreComunicacionEquipamientoRow, "torre_id" | "numero" | "categoria_equipo" | "texto">,
        Partial<TorreComunicacionEquipamientoRow>
      >;
      torre_comunicacion_relevamientos: Tbl<
        TorreComunicacionRelevamientoRow,
        Partial<TorreComunicacionRelevamientoRow> &
          Pick<TorreComunicacionRelevamientoRow, "torre_id" | "numero_generacion" | "fecha" | "created_by">,
        Partial<TorreComunicacionRelevamientoRow>
      >;
      torre_comunicacion_relevamiento_lecturas: Tbl<
        TorreComunicacionRelevamientoLecturaRow,
        Partial<TorreComunicacionRelevamientoLecturaRow> &
          Pick<TorreComunicacionRelevamientoLecturaRow, "relevamiento_id" | "equipamiento_id">,
        Partial<TorreComunicacionRelevamientoLecturaRow>
      >;
      torre_tipo_largos: Tbl<TorreTipoLargoRow, Partial<TorreTipoLargoRow> & Pick<TorreTipoLargoRow, "tipo_torre" | "largo_tramo_m">, Partial<TorreTipoLargoRow>>;
      salas: Tbl<
        SalaRow,
        Partial<SalaRow> & Pick<SalaRow, "ubicacion_id" | "denominacion" | "tipo_construccion" | "numero_generacion" | "created_by">,
        Partial<SalaRow>
      >;
      tablero_adjuntos: Tbl<
        TableroAdjuntoRow,
        Partial<TableroAdjuntoRow> & Pick<TableroAdjuntoRow, "tablero_id" | "nombre" | "archivo_url">,
        Partial<TableroAdjuntoRow>
      >;
      catalogo_recurso_altura: Tbl<
        CatalogoRecursoAlturaRow,
        Partial<CatalogoRecursoAlturaRow> & Pick<CatalogoRecursoAlturaRow, "tipo_montaje">,
        Partial<CatalogoRecursoAlturaRow>
      >;
      catalogo_tipos_recurso_altura: Tbl<
        CatalogoTipoRecursoAlturaRow,
        Partial<CatalogoTipoRecursoAlturaRow> & Pick<CatalogoTipoRecursoAlturaRow, "nombre">,
        Partial<CatalogoTipoRecursoAlturaRow>
      >;
      catalogo_recurso_altura_bandas: Tbl<
        CatalogoRecursoAlturaBandaRow,
        Partial<CatalogoRecursoAlturaBandaRow> & Pick<CatalogoRecursoAlturaBandaRow, "tipo_montaje" | "altura_hasta_m" | "recurso">,
        Partial<CatalogoRecursoAlturaBandaRow>
      >;
      catalogo_calibre_cable: Tbl<
        CatalogoCalibreCableRow,
        Partial<CatalogoCalibreCableRow> & Pick<CatalogoCalibreCableRow, "amperaje_max" | "calibre_mm2">,
        Partial<CatalogoCalibreCableRow>
      >;
      equipos: Tbl<
        EquipoRow,
        Partial<EquipoRow> & Pick<EquipoRow, "ubicacion_id" | "categoria_equipo" | "texto">,
        Partial<EquipoRow>
      >;
      equipo_relevamientos: Tbl<
        EquipoRelevamientoRow,
        Partial<EquipoRelevamientoRow> & Pick<EquipoRelevamientoRow, "ubicacion_id" | "numero_generacion" | "fecha" | "created_by">,
        Partial<EquipoRelevamientoRow>
      >;
      equipo_relevamiento_lecturas: Tbl<
        EquipoRelevamientoLecturaRow,
        Partial<EquipoRelevamientoLecturaRow> & Pick<EquipoRelevamientoLecturaRow, "relevamiento_id" | "equipo_id">,
        Partial<EquipoRelevamientoLecturaRow>
      >;
      bajas_equipamiento: Tbl<
        BajaEquipamientoRow,
        Partial<BajaEquipamientoRow> &
          Pick<BajaEquipamientoRow, "numero_generacion" | "tipo_equipo" | "equipo_id" | "equipo_texto" | "equipo_categoria" | "ubicacion_id" | "motivo" | "fecha" | "created_by">,
        Partial<BajaEquipamientoRow>
      >;
      entregas_deposito: Tbl<
        EntregaDepositoRow,
        Partial<EntregaDepositoRow> &
          Pick<EntregaDepositoRow, "numero_generacion" | "origen" | "descripcion" | "condicion" | "motivo" | "ubicacion_id" | "fecha" | "created_by">,
        Partial<EntregaDepositoRow>
      >;
      instalaciones: Tbl<
        InstalacionRow,
        Partial<InstalacionRow> & Pick<InstalacionRow, "numero_generacion" | "ubicacion_id" | "fecha" | "descripcion" | "cantidad" | "created_by">,
        Partial<InstalacionRow>
      >;
      ia_uso: Tbl<
        IaUsoRow,
        Partial<IaUsoRow> &
          Pick<IaUsoRow, "endpoint" | "modulo" | "modelo" | "input_tokens" | "output_tokens" | "costo_estimado_usd" | "created_by">,
        Partial<IaUsoRow>
      >;
      tablero_lecturas_ia: Tbl<
        TableroLecturaIaRow,
        Partial<TableroLecturaIaRow> &
          Pick<TableroLecturaIaRow, "modelo" | "input_tokens" | "output_tokens" | "costo_estimado_usd" | "json_crudo" | "circuitos_adaptados" | "created_by">,
        Partial<TableroLecturaIaRow>
      >;
      mantenimiento_intervalos: Tbl<
        MantenimientoIntervaloRow,
        Partial<MantenimientoIntervaloRow> & Pick<MantenimientoIntervaloRow, "tipo_equipo" | "categoria" | "frecuencia_dias">,
        Partial<MantenimientoIntervaloRow>
      >;
      mantenimientos_equipamiento: Tbl<
        MantenimientoEquipamientoRow,
        Partial<MantenimientoEquipamientoRow> &
          Pick<MantenimientoEquipamientoRow, "tipo_equipo" | "equipo_id" | "fecha" | "created_by">,
        Partial<MantenimientoEquipamientoRow>
      >;
      mantenimiento_programaciones: Tbl<
        MantenimientoProgramacionRow,
        Partial<MantenimientoProgramacionRow> &
          Pick<MantenimientoProgramacionRow, "tipo_equipo" | "equipo_id" | "fecha_programada" | "created_by">,
        Partial<MantenimientoProgramacionRow>
      >;
      mantenimiento_checklist_items: Tbl<
        MantenimientoChecklistItemRow,
        Partial<MantenimientoChecklistItemRow> & Pick<MantenimientoChecklistItemRow, "tipo_equipo" | "categoria" | "texto">,
        Partial<MantenimientoChecklistItemRow>
      >;
      mantenimiento_checklist_respuestas: Tbl<
        MantenimientoChecklistRespuestaRow,
        Partial<MantenimientoChecklistRespuestaRow> & Pick<MantenimientoChecklistRespuestaRow, "mantenimiento_id" | "item_id" | "estado">,
        Partial<MantenimientoChecklistRespuestaRow>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
