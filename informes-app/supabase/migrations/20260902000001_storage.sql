-- ============================================================================
-- Storage buckets para fotos de informes, comprobantes, PDFs generados,
-- documentación de vehículos y logo de la empresa.
-- Todos privados: se accede vía URLs firmadas generadas server-side.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('informe-fotos', 'informe-fotos', false),
  ('comprobantes', 'comprobantes', false),
  ('informes-pdf', 'informes-pdf', false),
  ('vehiculo-docs', 'vehiculo-docs', false),
  ('logo-empresa', 'logo-empresa', true)
on conflict (id) do nothing;

-- informe-fotos: cada usuario sube dentro de su propia carpeta {uid}/...
create policy "informe_fotos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'informe-fotos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "informe_fotos_select_own" on storage.objects
  for select using (
    bucket_id = 'informe-fotos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "informe_fotos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'informe-fotos' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- comprobantes: mismo patrón, carpeta por usuario.
create policy "comprobantes_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "comprobantes_select_own" on storage.objects
  for select using (
    bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "comprobantes_delete_own" on storage.objects
  for delete using (
    bucket_id = 'comprobantes' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- informes-pdf: el PDF se genera en una Server Action con la sesión del usuario
-- (misma carpeta {uid}/... que informe-fotos), así que sube y lee con su propia sesión.
create policy "informes_pdf_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'informes-pdf' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "informes_pdf_select_own" on storage.objects
  for select using (
    bucket_id = 'informes-pdf' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "informes_pdf_update_own" on storage.objects
  for update using (
    bucket_id = 'informes-pdf' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- vehiculo-docs y logo-empresa: solo Admin gestiona (Configuración); logo-empresa
-- es público de lectura porque se referencia directo en el <head> del PDF.
create policy "vehiculo_docs_admin_all" on storage.objects
  for all using (bucket_id = 'vehiculo-docs' and public.is_admin())
  with check (bucket_id = 'vehiculo-docs' and public.is_admin());

create policy "logo_empresa_public_select" on storage.objects
  for select using (bucket_id = 'logo-empresa');
create policy "logo_empresa_admin_write" on storage.objects
  for insert with check (bucket_id = 'logo-empresa' and public.is_admin());
create policy "logo_empresa_admin_update" on storage.objects
  for update using (bucket_id = 'logo-empresa' and public.is_admin());
create policy "logo_empresa_admin_delete" on storage.objects
  for delete using (bucket_id = 'logo-empresa' and public.is_admin());
