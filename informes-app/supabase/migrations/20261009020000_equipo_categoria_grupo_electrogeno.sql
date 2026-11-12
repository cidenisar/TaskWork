-- Falta esta categoría en Equipos Individuales (señalado por uso real en
-- campo) — ALTER TYPE ... ADD VALUE va en su propia migración/transacción,
-- no se puede usar el valor nuevo en la misma transacción que lo crea.
alter type public.equipo_categoria add value if not exists 'grupo_electrogeno';
