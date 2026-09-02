-- La Verificación de fotos vs. tarea (Estadísticas, spec 8.8) descarga las
-- fotos originales del informe con la sesión del Admin/Supervisor que la
-- dispara — no del técnico que las subió. La policy de informe-fotos era
-- select-own-only, así que sin esto un Admin/Supervisor no podía leer fotos
-- ajenas y la función fallaba para cualquier informe que no fuera propio.
create policy "informe_fotos_select_stats" on storage.objects
  for select using (bucket_id = 'informe-fotos' and public.is_admin_or_supervisor());
