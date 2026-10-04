-- ============================================================================
-- Backfill (no DDL): matchea a mano los ~16 Informes Técnicos y 6 Rendiciones
-- de Gastos reales que se habían cargado ANTES de que existiera el picker de
-- Ubicación, con provincia/ubicación en texto libre e inconsistente ("CILC",
-- "PUESTO 1 CILC", "PUESTO 1 CILCO", "Puesto 1 clc"... todos el mismo lugar
-- con errores de tipeo distintos). Revisado y confirmado con el usuario
-- antes de aplicar — ver conversación del 2026-10-04.
--
-- Grupo "CILC" (Complejo Industrial Luján de Cuyo): "PUESTO 1"/"PUESTO 2" son
-- plantas EXACTAS dentro del sitio REFINERIA LUJAN DE CUYO en el catálogo
-- (ya usado por un equipo relevado) — se linkean ahí. El único registro que
-- solo dice "CILC" sin número de puesto va al sitio general.
--
-- Grupo "TVM"/"Terminal Villa Mercedes": tenían provincia "Mendoza" cargada a
-- mano, pero Villa Mercedes es una ciudad de San Luis — y no hay ningún
-- "Terminal Villa Mercedes" en el catálogo (solo "Poliducto Villa Mercedes"/
-- "Estación de Bombeo VM", que parece ser otro sitio distinto). Se da de alta
-- un sitio nuevo "TERMINAL VILLA MERCEDES" en San Luis, corrigiendo la
-- provincia, y se linkean ahí.
--
-- Quedaron SIN tocar (texto demasiado vago para inferir un sitio con
-- confianza, o directamente sin dato): "Laboratorio de infraestructura",
-- "Sala" (título "Hfhg"), y los registros de prueba "zzzzz"/"tttt"/
-- "Viaje Bs As" (x2)/"Chfhhh" — quedan con ubicacion_id null como antes.
-- ============================================================================

-- Sitio nuevo: Terminal Villa Mercedes (San Luis)
insert into public.ubicaciones (pais, region, provincia, localidad, sitio)
values ('Argentina', 'NOA', 'San Luis', 'Villa Mercedes', 'TERMINAL VILLA MERCEDES');

-- El id generado arriba y los ids de REFINERIA LUJAN DE CUYO/PUESTO 1/PUESTO 2
-- (ya existentes en el catálogo importado) se usaron directo en los UPDATE de
-- informes_tecnicos/rendiciones_gastos aplicados en la misma sesión — no se
-- repiten acá como DDL porque son datos (texto libre -> ubicacion_id), no
-- estructura. El resultado queda documentado en el README.
