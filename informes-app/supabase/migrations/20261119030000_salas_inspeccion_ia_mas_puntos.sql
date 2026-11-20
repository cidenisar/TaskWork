-- ============================================================================
-- Inspección IA de Salas / Shelters: más puntos de inspección (19/11/2026)
--
-- Se suman los sistemas de incendio y de CCTV y lo que hace falta para que una sala sea apta
-- para equipos de energía y comunicaciones (seguridad física, protecciones eléctricas, climatización
-- con respaldo, monitoreo ambiental, instalación de racks y circulación). Se agregan al final de la
-- lista ya cargada (orden 17 en adelante) y solo los que todavía no estén, así se puede correr de
-- nuevo sin duplicar y no pisa lo que un Admin haya editado en Configuración → Catálogos.
-- ============================================================================

insert into public.catalogo_inspeccion_ia (modulo, orden, texto)
select 'salas', v.orden, v.texto
from (values
  (17, 'Detectores de humo / sistema de detección de incendio: ausentes, tapados, sin central visible o con luz de falla'),
  (18, 'Extinción automática (agente limpio o CO₂), pulsadores y sirena de alarma de incendio: ausentes, dañados o sin señalizar'),
  (19, 'Cámaras de CCTV: ausentes, sin cubrir el acceso y los equipos, mal orientadas, sucias o dañadas'),
  (20, 'Control de acceso y alarma de intrusión: puerta sin lector ni cerradura segura, sin sensor de apertura ni alarma'),
  (21, 'Alargues, zapatillas o instalaciones eléctricas improvisadas, tomas sobrecargadas'),
  (22, 'Protección contra sobretensiones: sin descargadores ni protecciones visibles en la alimentación de los equipos'),
  (23, 'Climatización sin respaldo: un solo equipo de aire para toda la sala o sin termómetro de temperatura'),
  (24, 'Sin sensores de temperatura y humedad ni detector de inundación (monitoreo ambiental)'),
  (25, 'Pasillos de trabajo obstruidos: sin espacio libre frente a racks y tableros'),
  (26, 'Material combustible almacenado: cartón, madera, solventes o embalajes'),
  (27, 'Racks o equipos mal instalados: apoyados en el piso, sin anclaje o con huecos sin tapas ciegas')
) as v(orden, texto)
where not exists (
  select 1 from public.catalogo_inspeccion_ia c where c.modulo = 'salas' and c.texto = v.texto
);
