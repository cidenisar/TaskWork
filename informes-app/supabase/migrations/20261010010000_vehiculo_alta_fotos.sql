-- Alta de vehículo con fotos (IA): además de patente/marca/modelo/km, el
-- nuevo flujo también deja un estado general (rayones/roturas visibles) al
-- momento del alta — igual criterio de siempre: la IA describe lo que ve y
-- el técnico revisa/corrige antes de guardar, nunca es la fuente de verdad
-- final. "estado_alta" es una foto del estado EN ESE MOMENTO, no un
-- registro que se actualiza después (para eso ya existe Service).
alter table public.catalogo_vehiculos
  add column if not exists estado_alta text,
  add column if not exists tiene_danios_alta boolean,
  add column if not exists foto_estado_alta_url text,
  add column if not exists foto_tablero_url text;
