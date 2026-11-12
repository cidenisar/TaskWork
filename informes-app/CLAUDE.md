@AGENTS.md

## Módulo Guardia General
Documentación completa en `informes-app/docs/guardia-general/` (empezar por `HANDOFF-guardia-general.md`). El prototipo es referencia de comportamiento, no el código final.

Reglas permanentes de este módulo:
- **Cálculo de activaciones** = `informes-app/docs/guardia-general/codigo-motor/` (22 tests). Minutos enteros. El INICIO del llamado clasifica: día hábil 07:30–17:00 = dedicación funcional (todo el evento, no suma); desde 17:00 = activación; 0:00–07:30 = activación que cuenta solo hasta 07:30; fin de semana o feriado marcado = 0–24. Se suma por persona y por día calendario y recién ahí se corta: ≤ 4:30 = media, más = entera. Eventos que cruzan medianoche se parten por día. No cambiar sin consultar a Ivan.
- **Guardia semanal de miércoles 10:00 a miércoles 10:00**, cuatro áreas con cronograma propio (General, Infraestructura, Datos, Enlaces); cada área tiene su propia rotación independiente. Una persona hace normalmente una sola, pero puede cubrir dos a la vez — su sector + la General que coordina los sectores (pedido de Ivan, 12/11; `guardia_persona` tiene PK (usuario_id, area), una fila por área que cubre). Todo lo que la empresa puede revisar (horarios, valores, hora de cambio, período) es **parámetro en pantalla con historial**; un cambio vale hacia adelante y no mueve períodos cerrados.
- **La hora la pone el servidor.** Reglas en el servidor; el rol se verifica en cada pedido; un test por rol de lo que NO puede. Corregir es solo de administrador y supervisor.
- Historial siempre con valor anterior. Versionado optimista. Pedidos idempotentes (id del dispositivo). Numeración de eventos correlativa sin huecos.
- Reporte de fallas desde el día uno; listas acotadas (30 + «ver más», corte por año); íconos con `title` y `aria-label` en escritorio, palabras en móvil.
- WhatsApp: sin número de empresa; teléfono de cada usuario y enlaces `wa.me` abiertos por quien dispara el aviso; el aviso garantizado es el push.
- Lo no decidido (sección 16 del HANDOFF) no se inventa: default del documento, parámetro y anotar la decisión pendiente.
- Reusar lo que la app ya tiene: `profiles.telefono`, reporte de fallas (`client_errores`, códigos `GRD-xx`), guards de `src/lib/auth.ts`, funciones SQL de rol. Historial con antes/después en tablas propias (el `audit_log` no guarda valor anterior). Push = Web Push con VAPID (`CRITERIOS_Y_IDEAS.md` §6). Aprendizajes reutilizables van a `CRITERIOS_Y_IDEAS.md` de la raíz.
- Trabajar por fases (sección 14). **No pasar de la Fase 0 sin aprobación de Ivan.**
