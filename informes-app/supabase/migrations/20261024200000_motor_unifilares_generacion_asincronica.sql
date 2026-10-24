-- Generación asincrónica del unifilar (ver motor-unifilares/README.md): el
-- botón "Generar unifilar" de Historial de Tableros ya no espera a que la IA
-- termine — encola el pedido acá y motor-unifilares lo procesa aparte (un
-- worker sin el límite de 60s de una función serverless de Vercel), y
-- escribe el resultado directo en tablero_mediciones con su service role key.

alter table public.tablero_mediciones
  add column unifilar_estado text null check (unifilar_estado in ('pendiente', 'generando', 'listo', 'error')),
  add column unifilar_error text null;

comment on column public.tablero_mediciones.unifilar_estado is
  'Estado de la generación asincrónica del unifilar por motor-unifilares (null = nunca se pidió). El botón "Generar unifilar" solo encola el pedido (ver motor_unifilares_jobs); el worker de motor-unifilares (service role) actualiza esta columna y, al terminar, dxf_url/unifilar_pdf_url.';
comment on column public.tablero_mediciones.unifilar_error is
  'Detalle del error si unifilar_estado = ''error'' — se muestra en Historial de Tableros.';

create table public.motor_unifilares_jobs (
  id uuid primary key default gen_random_uuid(),
  medicion_id uuid not null references public.tablero_mediciones(id) on delete cascade,
  circuitos jsonb not null,
  rotulo jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'generando', 'listo', 'error')),
  error_detalle text null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index motor_unifilares_jobs_estado_idx on public.motor_unifilares_jobs (estado, creado_en);

alter table public.motor_unifilares_jobs enable row level security;
-- Sin políticas a propósito (mismo criterio que motor_unifilares_ejemplos):
-- esta tabla la usa únicamente motor-unifilares con la service role key,
-- nunca el cliente (anon/authenticated) de informes-app.

comment on table public.motor_unifilares_jobs is
  'Cola de pedidos de generación de unifilar (botón "Generar unifilar", Historial de Tableros) — informes-app encola acá (POST /api/unifilar de motor-unifilares) y vuelve al toque, sin esperar la generación. Un worker aparte de motor-unifilares (scripts/procesar-cola.ts, corrido a mano mientras se valida calidad) toma los pendientes, genera el DXF/PDF, los sube y escribe el resultado directo en tablero_mediciones (estado + dxf_url/unifilar_pdf_url) con la service role key. Sin RLS abierto a propósito.';
