-- Informe de Instalación: lo que un técnico instala en un sitio a partir de
-- un remito de depósito en papel. Flujo: foto del remito (la IA arma una
-- lista de lo que debía traer) + fotos de los materiales efectivamente
-- instalados (mismo criterio de fotos+IA que el resto de la app) — lo que
-- sobra del remito y no se instaló genera automáticamente una Entrega a
-- Depósito (devolución), sin pasar por otro módulo.
--
-- Una fila por material instalado — varias filas de una misma carga
-- comparten `numero_generacion`/`pdf_url`/`remito_foto_url`, igual criterio
-- que `entregas_deposito` (ver 20261005090000_entregas_deposito_lote.sql):
-- índice normal en vez de UNIQUE, la unicidad se chequea en la app
-- (SELECT antes de insertar, con reintento).
create table public.instalaciones (
  id uuid primary key default gen_random_uuid(),
  numero_generacion text not null,
  ubicacion_id uuid not null references public.ubicaciones(id),
  fecha date not null,
  descripcion text not null,
  categoria text,
  marca_modelo text,
  numero_serie text,
  etiqueta_ypf text,
  cantidad integer not null default 1,
  comentario text,
  -- Remito en papel del depósito — foto y N° (si es legible), compartidos
  -- entre todas las filas de la misma carga.
  remito_foto_url text,
  remito_numero text,
  -- N° de generación de la devolución a depósito auto-generada con los
  -- sobrantes del remito, si hubo — referencia de solo lectura (texto, no
  -- FK) para mostrarla en el PDF/Historial, igual criterio que el resto de
  -- la app para comprobantes relacionados.
  entrega_deposito_numero_generacion text,
  created_by uuid not null references public.profiles(id),
  pdf_url text,
  pdf_generado_at timestamptz,
  created_at timestamptz not null default now()
);

create index instalaciones_numero_generacion_idx on public.instalaciones (numero_generacion);
create index instalaciones_ubicacion_id_idx on public.instalaciones (ubicacion_id);
create index instalaciones_created_by_idx on public.instalaciones (created_by);

alter table public.instalaciones enable row level security;

-- Abierto a cualquier autenticado (como equipos/entregas_deposito): es un
-- reporte de trabajo de campo que cualquier técnico carga, no una decisión
-- operativa restringida a Admin/Supervisor (eso sigue siendo Bajas y la
-- Entrega a Depósito manual).
create policy "instalaciones_select" on public.instalaciones
  for select using ((select auth.uid()) is not null);
create policy "instalaciones_insert" on public.instalaciones
  for insert with check ((select auth.uid()) is not null);
create policy "instalaciones_update" on public.instalaciones
  for update using ((select auth.uid()) is not null);
