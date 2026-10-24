-- Salas: permitir al creador actualizar su propia fila (fotos/PDF), igual criterio
-- que tablero_mediciones_update_own / rack_relevamientos_update_own /
-- equipo_relevamientos_update_own / torre_comunicacion_relevamientos_update_own.
-- Antes solo había UPDATE admin-only, así que las fotos y el PDF de Salas nunca se
-- grababan para ningún técnico no-admin (bug encontrado en revisión 2026-10-15).
create policy salas_update_own on public.salas
  for update
  using (created_by = (select auth.uid()));

-- Storage: permitir a Admin/Supervisor ver (createSignedUrl) el PDF/DXF/comprobante
-- de cualquier usuario en los buckets informes-pdf y comprobantes, igual criterio
-- que informe_fotos_select_stats. Aditiva (las policies permisivas se combinan con
-- OR) — no afloja nada de lo existente por-uid.
create policy informes_pdf_select_stats on storage.objects
  for select
  using (bucket_id = 'informes-pdf' and is_admin_or_supervisor());

create policy comprobantes_select_stats on storage.objects
  for select
  using (bucket_id = 'comprobantes' and is_admin_or_supervisor());
