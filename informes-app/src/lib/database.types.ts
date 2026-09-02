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

export type CatalogoProvinciaRow = {
  id: string;
  nombre: string;
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
}

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_nombre: string;
  actor_rol: Rol;
  accion: string;
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
      catalogo_provincias: Tbl<
        CatalogoProvinciaRow,
        Partial<CatalogoProvinciaRow> & Pick<CatalogoProvinciaRow, "nombre">,
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
