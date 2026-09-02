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

⏳ Pendiente (base de datos y permisos ya listos, falta la UI):

- Módulo Rendición de Gastos (wizard, PDF, Excel).
- Configuración (catálogos, vehículos/flota, emails, retención, auditoría).
- Estadísticas (KPIs, insights IA, asistente conversacional, mapa de calor).

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
