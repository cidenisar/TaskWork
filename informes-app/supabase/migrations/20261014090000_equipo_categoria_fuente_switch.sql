-- Equipamiento que suele estar instalado DENTRO de un tablero (fuente/
-- rectificador, switch de red) pero que en Equipos Individuales no tenía
-- categoría propia y caía en "otro" — se pueden dar de alta ahí, en la
-- misma Ubicación del tablero, sin modelar un vínculo tablero→equipo.
alter type public.equipo_categoria add value 'fuente';
alter type public.equipo_categoria add value 'switch';
