-- Jerarquía de tableros: distinguir un tablero Principal de uno Secundario,
-- y poder asociar un secundario al tablero del que "cuelga" (que puede ser
-- un Principal u OTRO Secundario — una cadena, no solo dos niveles). Base
-- para más adelante poder sumar cargas de los secundarios hacia su
-- principal. Opcional a propósito: un tablero sin clasificar (jerarquia
-- null) sigue funcionando igual que siempre, no se fuerza a clasificar
-- todo de una. Solo se carga al dar de alta el tablero (igual límite que
-- denominación/subsistemas — no hay edición de tablero existente todavía).
create type public.tablero_jerarquia as enum ('principal', 'secundario');

alter table public.tableros
  add column if not exists jerarquia public.tablero_jerarquia,
  add column if not exists tablero_padre_id uuid references public.tableros (id) on delete set null,
  add constraint tableros_padre_requiere_secundario check (tablero_padre_id is null or jerarquia = 'secundario');
