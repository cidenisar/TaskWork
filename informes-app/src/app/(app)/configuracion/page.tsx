import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { ConfiguracionView } from "@/components/config/view";

export default async function ConfiguracionPage() {
  const profile = await requireProfile();

  if (!puedeVerConfiguracion(profile.rol)) {
    return (
      <LockedPanel
        title="Solo para administradores"
        description="Los emails de envío, los catálogos y las políticas de almacenamiento solo los puede modificar un Administrador. Pedile acceso a tu responsable si necesitás cambiar algo acá."
      />
    );
  }

  const supabase = await createClient();

  const [
    configRes,
    usuariosRes,
    emailsRes,
    tecnicosRes,
    torresRes,
    provinciasRes,
    tiposRes,
    categoriasRes,
    vehiculosRes,
    servicesRes,
    auditRes,
  ] = await Promise.all([
    supabase
      .from("config_general")
      .select("logo_empresa_url, auto_enviar_email, umbral_aviso_historial, recordatorio_semanal_archivo, resumen_semanal_ia")
      .eq("id", 1)
      .single(),
    supabase.from("profiles").select("id, email, nombre_completo, rol").order("nombre_completo"),
    supabase.from("config_emails_envio").select("id, email, activo").order("email"),
    supabase.from("catalogo_tecnicos").select("id, nombre_completo, torre").order("nombre_completo"),
    supabase.from("catalogo_torres").select("id, nombre").order("nombre"),
    supabase.from("catalogo_provincias").select("id, nombre").order("nombre"),
    supabase.from("catalogo_tipos_informe").select("id, nombre").order("nombre"),
    supabase.from("catalogo_categorias_gasto").select("id, nombre").order("nombre"),
    supabase
      .from("catalogo_vehiculos")
      .select("id, patente, marca_modelo, vencimiento_tarjeta_verde, vencimiento_rto, kilometraje_actual")
      .order("patente"),
    supabase.from("vehiculo_services").select("id, vehiculo_id, fecha, kilometraje, descripcion").order("fecha", { ascending: false }),
    supabase.from("audit_log").select("id, actor_nombre, actor_rol, accion, created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  const patentePorVehiculo = new Map((vehiculosRes.data ?? []).map((v) => [v.id, v.patente]));

  return (
    <ConfiguracionView
      data={{
        logoUrl: configRes.data?.logo_empresa_url ?? null,
        autoEnviarEmail: configRes.data?.auto_enviar_email ?? true,
        usuarios: (usuariosRes.data ?? []).map((u) => ({
          id: u.id,
          email: u.email,
          nombreCompleto: u.nombre_completo,
          rol: u.rol,
        })),
        currentUserId: profile.id,
        emails: (emailsRes.data ?? []).map((e) => ({ id: e.id, email: e.email, activo: e.activo })),
        catalogos: {
          tecnicos: (tecnicosRes.data ?? []).map((t) => ({ id: t.id, nombreCompleto: t.nombre_completo, torre: t.torre })),
          torres: torresRes.data ?? [],
          provincias: provinciasRes.data ?? [],
          tiposInforme: tiposRes.data ?? [],
          categoriasGasto: categoriasRes.data ?? [],
          vehiculos: (vehiculosRes.data ?? []).map((v) => ({
            id: v.id,
            patente: v.patente,
            marcaModelo: v.marca_modelo,
            vencimientoTarjetaVerde: v.vencimiento_tarjeta_verde,
            vencimientoRto: v.vencimiento_rto,
            kilometrajeActual: v.kilometraje_actual,
          })),
          services: (servicesRes.data ?? []).map((s) => ({
            id: s.id,
            vehiculoId: s.vehiculo_id,
            patente: patentePorVehiculo.get(s.vehiculo_id) ?? "—",
            fecha: s.fecha,
            kilometraje: Number(s.kilometraje),
            descripcion: s.descripcion,
          })),
        },
        umbralAviso: configRes.data?.umbral_aviso_historial ?? "20",
        recordatorioSemanal: configRes.data?.recordatorio_semanal_archivo ?? true,
        resumenSemanalIa: configRes.data?.resumen_semanal_ia ?? true,
        auditLog: (auditRes.data ?? []).map((a) => ({
          id: a.id,
          actorNombre: a.actor_nombre,
          actorRol: a.actor_rol,
          accion: a.accion,
          createdAt: a.created_at,
        })),
      }}
    />
  );
}
