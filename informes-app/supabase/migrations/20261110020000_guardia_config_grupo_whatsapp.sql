-- El grupo de WhatsApp al que se avisan las novedades ("Novedades Guardia TI
-- Cuyo" hoy) es un parámetro editable, no un nombre fijo en el código — un
-- link wa.me no puede apuntar a un grupo, así que esto es solo el texto que
-- se muestra en pantalla para recordar a quién avisar manualmente.
alter table public.guardia_config
  add column grupo_whatsapp_nombre text not null default 'Novedades Guardia TI Cuyo';
