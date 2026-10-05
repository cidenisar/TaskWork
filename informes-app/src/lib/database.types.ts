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
export type EquipoCategoria =
  | "ups"
  | "banco_baterias"
  | "camara_cctv"
  | "control_acceso"
  | "impresora"
  | "telefonia"
  | "climatizacion"
  | "otro";
export type EstadoEquipamiento = "activo" | "baja" | "en_deposito";
export type OrigenEntregaDeposito = "equipo_existente" | "material_libre";
export type CondicionMaterial = "nuevo" | "usado_funcional";
export type MotivoEntregaDeposito = "sobrante_obra" | "reemplazo_funcional" | "retorno_mantenimiento" | "otro";
export type MotivoBaja = "rotura" | "ampliacion" | "obsolescencia" | "otro";
export type TipoEquipoBaja = "tablero_circuito" | "rack_equipamiento" | "equipo_individual";

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
  auto_enviar_email: boolean;
  umbral_aviso_historial: UmbralAviso;
  recordatorio_semanal_archivo: boolean;
  resumen_semanal_ia: boolean;
  liberacion_automatica_activa: boolean;
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
  ubicacion_id: string;
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

export type RackRow = {
  id: string;
  denominacion: string;
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
  foto_general_url: string | null;
  created_at: string;
}

export type RackRelevamientoLecturaRow = {
  id: string;
  relevamiento_id: string;
  equipamiento_id: string;
  estado: string | null;
  comentario: string | null;
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
  created_by: string | null;
  created_at: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
