-- ============================================================================
-- A estas 4 tablas les faltaba la policy de UPDATE para "created_by = auth.uid()"
-- (tenían SELECT e INSERT, pero no UPDATE) — a diferencia de informes_tecnicos y
-- rendiciones_gastos, que sí la tienen. Sin ella, los .update({pdf_url, ...})
-- y .update({foto_general_url, ...}) que corren después de subir el archivo a
-- Storage se ejecutaban sin error pero afectaban 0 filas (RLS deniega en
-- silencio), así que el PDF/foto quedaba subido a Storage pero el registro en
-- la base nunca se enteraba — el historial siempre mostraba "Sin PDF
-- disponible" para Tableros, Racks y Equipos Individuales.
--
-- Los registros ya existentes se recuperaron en el mismo momento con un
-- backfill de datos (no versionado como migración, igual criterio que el
-- resto de los fixes de datos de este proyecto): se buscó en storage.objects
-- el archivo ya subido bajo el path {userId}/{módulo}/{id}/... de cada
-- registro con pdf_url/foto_url nulo y se linkeó — todos los archivos que
-- faltaban (5 mediciones de tableros, 3 relevamientos de racks, 2 de equipos)
-- en realidad estaban subidos, solo no enlazados.
-- ============================================================================

create policy "tablero_mediciones_update_own" on public.tablero_mediciones
  for update using (created_by = (select auth.uid()));

create policy "tablero_mantenimientos_update_own" on public.tablero_mantenimientos
  for update using (created_by = (select auth.uid()));

create policy "rack_relevamientos_update_own" on public.rack_relevamientos
  for update using (created_by = (select auth.uid()));

create policy "equipo_relevamientos_update_own" on public.equipo_relevamientos
  for update using (created_by = (select auth.uid()));
