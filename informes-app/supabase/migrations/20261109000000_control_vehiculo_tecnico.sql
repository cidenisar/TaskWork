-- ============================================================================
-- El "control periódico de vehículo" (fotos + comparación con IA) hasta acá
-- era 100% Admin, cargado desde el Panel (service-tab.tsx). Ahora cualquier
-- técnico lo puede cargar desde el celu: fotos de todo el vehículo (exterior
-- + interior, como el alta), el kilometraje actual, y de paso se controla si
-- el botiquín y el matafuego están al día.
-- ============================================================================

-- Dos vencimientos más de seguridad del vehículo, mismo criterio que
-- vencimiento_tarjeta_verde / vencimiento_rto (fecha simple, sin foto).
alter table public.catalogo_vehiculos
  add column vencimiento_matafuego date,
  add column vencimiento_botiquin date;

-- Ya existía fotos_exterior_urls (control admin) — ahora el control del
-- técnico también saca fotos del interior, como el alta del vehículo.
alter table public.vehiculo_services
  add column fotos_interior_urls text[];

-- vehiculo_services era 100% Admin (vehiculo_services_admin_all, FOR ALL).
-- Un control periódico cargado por un técnico es dueño de su propia fila —
-- mismo criterio que tablero_mediciones_insert_own / _update_own. La
-- lectura queda abierta a cualquier autenticado (como catalogo_vehiculos):
-- el historial de controles de un vehículo le sirve a cualquiera que lo
-- maneje, no es un dato "propio" de quien lo cargó.
create policy "vehiculo_services_select" on public.vehiculo_services
  for select
  using ((select auth.uid()) is not null);

create policy "vehiculo_services_insert_own" on public.vehiculo_services
  for insert
  with check (created_by = (select auth.uid()));

create policy "vehiculo_services_update_own" on public.vehiculo_services
  for update
  using (created_by = (select auth.uid()));

-- vehiculo-docs (storage) era 100% Admin/Supervisor. El técnico sube sus
-- fotos de control bajo su propia carpeta ({auth.uid()}/vehiculo-controles/...
-- — mismo criterio de carpeta propia que informe-fotos/informes-pdf), nunca
-- pisa las rutas que ya usa el Admin (tarjeta-verde.jpg, rto.jpg, etc., que
-- cuelgan del id del vehículo). La lectura queda abierta a cualquier
-- autenticado: para que la comparación con IA pueda usar como referencia
-- tanto un control anterior de un técnico como uno de un Admin o las fotos
-- del alta.
create policy "vehiculo_docs_select_authenticated" on storage.objects
  for select
  using (bucket_id = 'vehiculo-docs' and (select auth.uid()) is not null);

create policy "vehiculo_docs_insert_own" on storage.objects
  for insert
  with check (bucket_id = 'vehiculo-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "vehiculo_docs_update_own" on storage.objects
  for update
  using (bucket_id = 'vehiculo-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
