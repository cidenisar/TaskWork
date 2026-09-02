-- ============================================================================
-- Informes — schema inicial
-- Ver PROJECT_SPEC.md sección 3 (modelo de datos) y sección 4 (roles y permisos).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.rol as enum ('tecnico', 'supervisor', 'admin');
create type public.estado_informe as enum ('borrador', 'generado');
create type public.estado_rendicion as enum ('abierta', 'cerrada');
create type public.moneda as enum ('ARS', 'USD');
create type public.umbral_aviso as enum ('20', '50', '100');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre_completo text not null,
  rol public.rol not null default 'tecnico',
  created_at timestamptz not null default now()
);

-- Crea el profile automáticamente al darse de alta en auth.users.
-- El rol por defecto es 'tecnico'; solo un Administrador lo puede subir después
-- (nunca lo elige el propio usuario — ver spec sección 4).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nombre_completo, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', split_part(new.email, '@', 1)),
    'tecnico'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Funciones helper para RLS (security definer para no recursar sobre profiles).
create function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and rol = 'admin'
  );
$$;

create function public.is_admin_or_supervisor()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and rol in ('admin', 'supervisor')
  );
$$;

-- ---------------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------------
create table public.catalogo_torres (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table public.catalogo_tecnicos (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  torre text references public.catalogo_torres (nombre) on update cascade,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (nombre_completo)
);

create table public.catalogo_provincias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table public.catalogo_tipos_informe (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table public.catalogo_categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

create table public.catalogo_vehiculos (
  id uuid primary key default gen_random_uuid(),
  patente text not null unique,
  marca_modelo text,
  kilometraje_actual numeric,
  vencimiento_tarjeta_verde date,
  foto_tarjeta_verde_url text,
  vencimiento_rto date,
  foto_rto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehiculo_services (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references public.catalogo_vehiculos (id) on delete cascade,
  fecha date not null,
  kilometraje numeric not null,
  foto_url text,
  descripcion text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Informes Técnicos
-- ---------------------------------------------------------------------------
create table public.informes_tecnicos (
  id uuid primary key default gen_random_uuid(),
  numero_generacion text not null unique,
  titulo text not null,
  fecha date not null,
  cliente text not null,
  proyecto text not null,
  ticket_numero text,
  permiso_trabajo text,
  tipo_informe text,
  provincia text,
  ubicacion text,
  descripcion_trabajo text,
  tareas_pendientes text,
  pdf_url text,
  pdf_generado_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  estado public.estado_informe not null default 'borrador'
);

create table public.informe_tecnicos_asignados (
  id uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.informes_tecnicos (id) on delete cascade,
  tecnico_nombre text not null,
  torre text,
  es_tecnico_seguridad boolean not null default false
);

create table public.informe_vehiculos (
  id uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.informes_tecnicos (id) on delete cascade,
  patente text not null,
  marca_modelo text
);

create table public.informe_imagenes (
  id uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.informes_tecnicos (id) on delete cascade,
  url text not null,
  lat double precision,
  lon double precision,
  accuracy_m double precision,
  tomada_en timestamptz not null default now(),
  orden integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Rendición de Gastos
-- ---------------------------------------------------------------------------
create table public.rendiciones_gastos (
  id uuid primary key default gen_random_uuid(),
  numero_generacion text not null unique,
  motivo text not null,
  fecha date not null,
  proyecto_cliente text,
  provincia text,
  viatico_recibido numeric not null,
  moneda public.moneda not null default 'ARS',
  pdf_url text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  estado public.estado_rendicion not null default 'abierta'
);

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  rendicion_id uuid not null references public.rendiciones_gastos (id) on delete cascade,
  fecha date not null,
  categoria text not null,
  monto numeric not null,
  descripcion text,
  comprobante_url text
);

create table public.gasto_tecnicos (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references public.gastos (id) on delete cascade,
  tecnico_nombre text not null,
  torre text
);

-- ---------------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------------
create table public.config_emails_envio (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  activo boolean not null default true
);

create table public.config_general (
  id smallint primary key default 1,
  logo_empresa_url text,
  auto_enviar_email boolean not null default true,
  umbral_aviso_historial public.umbral_aviso not null default '20',
  recordatorio_semanal_archivo boolean not null default true,
  resumen_semanal_ia boolean not null default true,
  constraint config_general_singleton check (id = 1)
);
insert into public.config_general (id) values (1);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  actor_nombre text not null,
  actor_rol public.rol not null,
  accion text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Provincias argentinas (spec sección 6.1)
-- ---------------------------------------------------------------------------
insert into public.catalogo_provincias (nombre) values
  ('Buenos Aires'), ('CABA'), ('Catamarca'), ('Chaco'), ('Chubut'), ('Córdoba'),
  ('Corrientes'), ('Entre Ríos'), ('Formosa'), ('Jujuy'), ('La Pampa'), ('La Rioja'),
  ('Mendoza'), ('Misiones'), ('Neuquén'), ('Río Negro'), ('Salta'), ('San Juan'),
  ('San Luis'), ('Santa Cruz'), ('Santa Fe'), ('Santiago del Estero'),
  ('Tierra del Fuego'), ('Tucumán');

-- Categorías de gasto por defecto (spec sección 3)
insert into public.catalogo_categorias_gasto (nombre) values
  ('Combustible'), ('Peaje'), ('Comida'), ('Alojamiento'), ('Otros');

-- Tipos de informe de ejemplo (coinciden con el wireframe, editable en Config)
insert into public.catalogo_tipos_informe (nombre) values
  ('Mantenimiento'), ('Instalación'), ('Inspección');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.catalogo_tecnicos enable row level security;
alter table public.catalogo_torres enable row level security;
alter table public.catalogo_provincias enable row level security;
alter table public.catalogo_tipos_informe enable row level security;
alter table public.catalogo_categorias_gasto enable row level security;
alter table public.catalogo_vehiculos enable row level security;
alter table public.vehiculo_services enable row level security;
alter table public.informes_tecnicos enable row level security;
alter table public.informe_tecnicos_asignados enable row level security;
alter table public.informe_vehiculos enable row level security;
alter table public.informe_imagenes enable row level security;
alter table public.rendiciones_gastos enable row level security;
alter table public.gastos enable row level security;
alter table public.gasto_tecnicos enable row level security;
alter table public.config_emails_envio enable row level security;
alter table public.config_general enable row level security;
alter table public.audit_log enable row level security;

-- profiles: cada quien ve/actualiza su fila; admin ve y actualiza todas
-- (el rol solo lo cambia un Administrador, nunca el propio usuario).
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Catálogos de uso compartido (técnicos, torres, provincias, tipos de informe,
-- categorías de gasto): cualquier usuario autenticado puede leer y agregar
-- "al vuelo" desde los formularios de carga; solo un Admin edita/borra
-- (spec: "todos permiten agregar ítems nuevos al vuelo").
create policy "catalogo_tecnicos_select" on public.catalogo_tecnicos for select using (auth.uid() is not null);
create policy "catalogo_tecnicos_insert" on public.catalogo_tecnicos for insert with check (auth.uid() is not null);
create policy "catalogo_tecnicos_admin_write" on public.catalogo_tecnicos for update using (public.is_admin());
create policy "catalogo_tecnicos_admin_delete" on public.catalogo_tecnicos for delete using (public.is_admin());

create policy "catalogo_torres_select" on public.catalogo_torres for select using (auth.uid() is not null);
create policy "catalogo_torres_insert" on public.catalogo_torres for insert with check (auth.uid() is not null);
create policy "catalogo_torres_admin_delete" on public.catalogo_torres for delete using (public.is_admin());

create policy "catalogo_provincias_select" on public.catalogo_provincias for select using (auth.uid() is not null);
create policy "catalogo_provincias_insert" on public.catalogo_provincias for insert with check (auth.uid() is not null);
create policy "catalogo_provincias_admin_delete" on public.catalogo_provincias for delete using (public.is_admin());

create policy "catalogo_tipos_informe_select" on public.catalogo_tipos_informe for select using (auth.uid() is not null);
create policy "catalogo_tipos_informe_insert" on public.catalogo_tipos_informe for insert with check (auth.uid() is not null);
create policy "catalogo_tipos_informe_admin_delete" on public.catalogo_tipos_informe for delete using (public.is_admin());

create policy "catalogo_categorias_gasto_select" on public.catalogo_categorias_gasto for select using (auth.uid() is not null);
create policy "catalogo_categorias_gasto_insert" on public.catalogo_categorias_gasto for insert with check (auth.uid() is not null);
create policy "catalogo_categorias_gasto_admin_delete" on public.catalogo_categorias_gasto for delete using (public.is_admin());

-- Vehículos: lectura abierta (autocompletado en los wizards), gestión completa
-- (ficha, service, vencimientos) solo Admin — spec sección 4 y 9.4.
create policy "catalogo_vehiculos_select" on public.catalogo_vehiculos for select using (auth.uid() is not null);
create policy "catalogo_vehiculos_admin_write" on public.catalogo_vehiculos for insert with check (public.is_admin());
create policy "catalogo_vehiculos_admin_update" on public.catalogo_vehiculos for update using (public.is_admin());
create policy "catalogo_vehiculos_admin_delete" on public.catalogo_vehiculos for delete using (public.is_admin());

create policy "vehiculo_services_admin_all" on public.vehiculo_services for all
  using (public.is_admin()) with check (public.is_admin());

-- Informes Técnicos: "crear/ver propios" para los tres roles (spec sección 4).
-- La vista agregada de Estadísticas para Supervisor/Admin se resuelve server-side
-- con la service role key, nunca exponiendo una policy de lectura ancha al cliente.
create policy "informes_tecnicos_select_own" on public.informes_tecnicos
  for select using (created_by = auth.uid());
create policy "informes_tecnicos_insert_own" on public.informes_tecnicos
  for insert with check (created_by = auth.uid());
create policy "informes_tecnicos_update_own" on public.informes_tecnicos
  for update using (created_by = auth.uid());

create policy "informe_tecnicos_asignados_own" on public.informe_tecnicos_asignados
  for all using (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = auth.uid())
  );

create policy "informe_vehiculos_own" on public.informe_vehiculos
  for all using (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = auth.uid())
  );

create policy "informe_imagenes_own" on public.informe_imagenes
  for all using (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.informes_tecnicos i where i.id = informe_id and i.created_by = auth.uid())
  );

-- Rendición de Gastos: mismo patrón "crear/ver propios".
create policy "rendiciones_gastos_select_own" on public.rendiciones_gastos
  for select using (created_by = auth.uid());
create policy "rendiciones_gastos_insert_own" on public.rendiciones_gastos
  for insert with check (created_by = auth.uid());
create policy "rendiciones_gastos_update_own" on public.rendiciones_gastos
  for update using (created_by = auth.uid());

create policy "gastos_own" on public.gastos
  for all using (
    exists (select 1 from public.rendiciones_gastos r where r.id = rendicion_id and r.created_by = auth.uid())
  ) with check (
    exists (select 1 from public.rendiciones_gastos r where r.id = rendicion_id and r.created_by = auth.uid())
  );

create policy "gasto_tecnicos_own" on public.gasto_tecnicos
  for all using (
    exists (
      select 1 from public.gastos g
      join public.rendiciones_gastos r on r.id = g.rendicion_id
      where g.id = gasto_id and r.created_by = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.gastos g
      join public.rendiciones_gastos r on r.id = g.rendicion_id
      where g.id = gasto_id and r.created_by = auth.uid()
    )
  );

-- Configuración: lectura abierta (logo y emails se usan en los wizards),
-- escritura solo Admin (spec sección 4 y 9).
create policy "config_emails_envio_select" on public.config_emails_envio for select using (auth.uid() is not null);
create policy "config_emails_envio_admin_write" on public.config_emails_envio for insert with check (public.is_admin());
create policy "config_emails_envio_admin_update" on public.config_emails_envio for update using (public.is_admin());
create policy "config_emails_envio_admin_delete" on public.config_emails_envio for delete using (public.is_admin());

create policy "config_general_select" on public.config_general for select using (auth.uid() is not null);
create policy "config_general_admin_update" on public.config_general for update using (public.is_admin());

-- audit_log: solo lectura Admin; las escrituras las hace el backend con la
-- service role key (nunca directo desde el cliente) para que el registro sea confiable.
create policy "audit_log_select_admin" on public.audit_log for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Índices de soporte a búsqueda / listados
-- ---------------------------------------------------------------------------
create index informes_tecnicos_created_by_idx on public.informes_tecnicos (created_by, fecha desc);
create index informe_imagenes_informe_id_idx on public.informe_imagenes (informe_id);
create index rendiciones_gastos_created_by_idx on public.rendiciones_gastos (created_by, fecha desc);
create index gastos_rendicion_id_idx on public.gastos (rendicion_id);
create index catalogo_tecnicos_nombre_idx on public.catalogo_tecnicos (nombre_completo);
