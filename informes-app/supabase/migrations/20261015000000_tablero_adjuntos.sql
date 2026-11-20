-- Adjuntos de tablero — archivos sueltos que un técnico puede sumar a un
-- tablero (un unifilar propio hecho en AutoCAD, un PDF, una foto del
-- gabinete, etc.), aparte del unifilar en vivo y el DXF que ya genera
-- "Nueva Medición". No reemplazan nada — el visor público del QR sigue
-- dibujando el esquema en vivo a partir de los circuitos actuales; esto
-- es simplemente una lista de archivos de referencia que se suman ahí
-- mismo.
create table public.tablero_adjuntos (
  id uuid primary key default gen_random_uuid(),
  tablero_id uuid not null references public.tableros (id) on delete cascade,
  nombre text not null,
  archivo_url text not null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index tablero_adjuntos_tablero_idx on public.tablero_adjuntos (tablero_id);

alter table public.tablero_adjuntos enable row level security;

-- Igual criterio que el resto de lo que carga un técnico en el campo
-- (fotos generales, checklist): cualquier logueado puede ver y agregar,
-- solo Admin borra (para corregir un error de carga).
create policy "tablero_adjuntos_select" on public.tablero_adjuntos for select using ((select auth.uid()) is not null);
create policy "tablero_adjuntos_insert" on public.tablero_adjuntos for insert with check ((select auth.uid()) is not null);
create policy "tablero_adjuntos_admin_delete" on public.tablero_adjuntos for delete using (public.is_admin());

-- Mismo bucket privado que ya usan el DXF/PDF de cada medición
-- (informes-pdf), bajo su propio prefijo "tablero-adjuntos/" para no
-- tocar las policies "_own" (por carpeta de uid) que ya tiene ese bucket
-- para lo que genera "Nueva Medición".
create policy "informes_pdf_tablero_adjuntos_select" on storage.objects for select
  using (bucket_id = 'informes-pdf' and (storage.foldername(name))[1] = 'tablero-adjuntos' and (select auth.uid()) is not null);
create policy "informes_pdf_tablero_adjuntos_insert" on storage.objects for insert
  with check (bucket_id = 'informes-pdf' and (storage.foldername(name))[1] = 'tablero-adjuntos' and (select auth.uid()) is not null);
create policy "informes_pdf_tablero_adjuntos_delete_admin" on storage.objects for delete
  using (bucket_id = 'informes-pdf' and (storage.foldername(name))[1] = 'tablero-adjuntos' and public.is_admin());
