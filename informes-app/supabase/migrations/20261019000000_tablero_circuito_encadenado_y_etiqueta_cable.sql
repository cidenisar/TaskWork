-- Para dibujar el unifilar como lo arma el técnico a mano: varias
-- protecciones de un mismo circuito físico (ej. térmica + disyuntor
-- diferencial) van en la MISMA columna del plano, una debajo de la otra, no
-- como columnas separadas. circuito_padre_id apunta al circuito del que
-- "cuelga" este (NULL = es la cabeza de su propia columna/cadena).
-- etiqueta_cable es el número/código de cable que el técnico usa en el
-- plano real (ej. "A80") -- no se autogenera, sigue el esquema propio de
-- cada proyecto, así que es texto libre que carga el técnico.
alter table tablero_circuitos add column circuito_padre_id uuid references tablero_circuitos(id) on delete set null;
alter table tablero_circuitos add column etiqueta_cable text;
