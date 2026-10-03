-- Informe Técnico y Rendición de Gastos se suman al mismo sistema de
-- Ubicación que ya usan Tableros/Racks. Se agrega ubicacion_id (opcional,
-- igual que hoy son opcionales provincia/ubicacion) sin tocar las columnas
-- de texto libre existentes — los ~16/6 registros ya cargados en producción
-- (datos reales, no de prueba) siguen mostrando su provincia/ubicación tal
-- cual las escribió el técnico. Los informes/rendiciones nuevos usan el
-- selector estructurado y, además, completan esas mismas columnas de texto
-- (derivadas de la Ubicación elegida) para que el historial, el PDF y el
-- cálculo de mantenimiento predictivo de Estadísticas sigan funcionando
-- sin cambios — migrar esos lectores a `ubicacion_id` queda para una
-- próxima vuelta.

alter table public.informes_tecnicos add column ubicacion_id uuid references public.ubicaciones (id);
alter table public.rendiciones_gastos add column ubicacion_id uuid references public.ubicaciones (id);
