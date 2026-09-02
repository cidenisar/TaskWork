# Informes

App web (Next.js 16 + Tailwind + Supabase) para que técnicos de campo carguen
**Informes Técnicos** y **Rendiciones de Gastos**. Spec completa en
`PROJECT_SPEC.md` (en esta misma carpeta) — este README es solo cómo correr
y qué está hecho.

El diseño replica 1:1 el wireframe de referencia (tema oscuro, acento
naranja/rojo `#ff7a3d → #ff4747`): ver `src/app/wireframe-ui.css`, portado
directamente del prototipo HTML aprobado por el cliente.

## Estado de esta iteración

✅ Hecho:

- Scaffold Next.js 16 (App Router) + Tailwind 4 + TypeScript, PWA básica.
- Schema completo de Supabase (`supabase/migrations/`) con las ~18 tablas de
  la spec, RLS por rol (Técnico/Supervisor/Administrador) y buckets de Storage.
- Auth real con Supabase Auth (reemplaza el selector de rol mock del
  wireframe) + navegación protegida + sesión con badge de rol.
- Módulo **Informe Técnico** completo: wizard de 4 pasos, catálogos con alta
  "al vuelo", fotos con marca de agua + geolocalización (degrada bien sin
  GPS), "Mejorar con IA" (Claude API) y dictado por voz (Web Speech API),
  generación de PDF **server-side** replicando el diseño aprobado
  (`Informe Tecnico - Diseño PDF.pdf`), historial con búsqueda en lenguaje
  natural y descarga múltiple en `.zip`.
- Módulo **Rendición de Gastos** completo: wizard de 3 pasos (los técnicos se
  cargan por gasto, no por rendición — spec 7.1), categorías con alta al
  vuelo, comprobante por foto, caja de saldo verde/rojo, PDF server-side
  replicando `Rendicion de Gastos - Diseño PDF.pdf`, exportación a Excel
  (`exceljs`) y historial con búsqueda en lenguaje natural.
- Módulo **Configuración** completo (solo Administrador): logo de la empresa
  + envío automático por email, catálogos con alta/baja (técnicos, torres,
  provincias, tipos de informe, categorías de gasto), ficha completa de
  vehículos con badges 🟢🟡🔴 de vencimiento, registro de service, alertas
  de flota "Vencimientos 🤖" recalculadas en vivo (documentación + intervalo
  de 10.000 km), umbral de aviso de historial, resumen semanal por IA
  (config + ejemplo) y Registro de Cambios (auditoría — cada alta/baja queda
  en `audit_log` con quién, qué y cuándo).
- Módulo **Estadísticas** completo (Admin/Supervisor): KPIs del mes, gastos
  por categoría e informes por técnico (datos reales), **insights
  automáticos 🤖** (Claude redacta observaciones sobre números ya calculados
  server-side, nunca inventa cifras), **asistente en lenguaje natural 💬**
  con tool-use real de Claude contra 4 consultas agregadas de solo lectura
  (nunca acceso de escritura ni filas crudas), **mapa de calor 🗺** real
  (Leaflet + OpenStreetMap, sin necesitar API key, a diferencia del mock del
  wireframe), **comparación entre técnicos ⚖️** y **mantenimiento
  predictivo 🔧** (cálculo determinístico por torre/ubicación) y
  **verificación de fotos vs. tarea 🔍** con Claude vision, on-demand por
  informe para no disparar un análisis automático (y su costo) en cada
  carga de la página.

Con esto están completos los 4 módulos de la spec (Informe Técnico,
Rendición de Gastos, Configuración, Estadísticas).

⏳ Explícitamente pendiente (jobs de background, no UI):

- El job que efectivamente libera del storage el PDF/fotos pasado el umbral
  configurado (el umbral ya se guarda y se muestra en el historial, pero
  nada lo aplica todavía).
- Resumen semanal por IA y recordatorio de archivo: el switch y el ejemplo
  ya están en Configuración, pero el envío real (cron + email) no está
  implementado.
- Vista de mapa de todas las ubicaciones históricas fuera de Estadísticas —
  explícitamente fuera de alcance en spec sección 6.6/13.

## Setup

### 1. Proyecto de Supabase

Este repo **no tiene un proyecto de Supabase vinculado todavía** — hay que
crear uno (o reusar uno existente) y correr las migraciones:

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push          # aplica supabase/migrations/*.sql
```

Eso crea las tablas, RLS y los buckets de Storage (`informe-fotos`,
`comprobantes`, `informes-pdf`, `vehiculo-docs`, `logo-empresa`).

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Project
  Settings → API en el dashboard de Supabase.
- `ANTHROPIC_API_KEY`: opcional — sin ella, "Mejorar con IA" avisa que no
  está disponible en vez de fallar en silencio.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL`: opcional — sin ellas, el informe se
  genera igual pero no se manda el email automático.

### 3. Primer usuario Administrador

El rol lo asigna un Administrador desde Configuración (spec sección 4), pero
para el primer usuario hay que hacerlo a mano una vez, desde el SQL editor
de Supabase:

```sql
update public.profiles set rol = 'admin' where email = 'tu-email@empresa.com';
```

(El trigger `handle_new_user` crea el `profile` en `rol = 'tecnico'` en
cuanto alguien se registra vía Supabase Auth.)

### 4. Correr en desarrollo

```bash
npm install
npm run dev
```

## Notas de implementación

- **PDF server-side**: `@react-pdf/renderer`, sin navegador — mismo layout
  en cualquier dispositivo (spec sección 11). Ver `src/lib/pdf/`.
- **RLS, no solo UI**: un Técnico no puede leer Configuración/Estadísticas
  ni por API aunque manipule el frontend — ver
  `supabase/migrations/20260902000000_init.sql`.
- **Fotos**: la marca de agua + franja de fecha/hora/GPS se "queman" en el
  JPG en el navegador (canvas) antes de subir; lat/lon/accuracy también se
  guardan estructurados en `informe_imagenes` para el futuro mapa de calor.
- **Modelo dato-vs-archivo del historial** (spec 6.5): el registro es
  permanente, el PDF/fotos son temporales. El job que libera el storage
  pasado el umbral configurado todavía no está implementado (vive en el
  módulo Configuración, pendiente); la UI del historial ya distingue
  "PDF disponible" de "Solo registro".
