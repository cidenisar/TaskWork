import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ListaUbicaciones, type UbicacionRow } from "@/components/ubicaciones/lista";

export default async function UbicacionesPage() {
  await requireProfile();
  const supabase = await createClient();

  const [ubicacionesRes, tablerosRes, racksRes, equiposRes] = await Promise.all([
    supabase
      .from("ubicaciones")
      .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
      .order("provincia")
      .order("sitio"),
    supabase.from("tableros").select("id, ubicacion_id"),
    supabase.from("racks").select("id, ubicacion_id"),
    supabase.from("equipos").select("id, ubicacion_id"),
  ]);

  const tablerosPorUbicacion = new Map<string, number>();
  for (const t of tablerosRes.data ?? []) {
    tablerosPorUbicacion.set(t.ubicacion_id, (tablerosPorUbicacion.get(t.ubicacion_id) ?? 0) + 1);
  }
  const racksPorUbicacion = new Map<string, number>();
  for (const r of racksRes.data ?? []) {
    racksPorUbicacion.set(r.ubicacion_id, (racksPorUbicacion.get(r.ubicacion_id) ?? 0) + 1);
  }
  const equiposPorUbicacion = new Map<string, number>();
  for (const e of equiposRes.data ?? []) {
    equiposPorUbicacion.set(e.ubicacion_id, (equiposPorUbicacion.get(e.ubicacion_id) ?? 0) + 1);
  }

  const ubicaciones: UbicacionRow[] = (ubicacionesRes.data ?? []).map((u) => ({
    id: u.id,
    pais: u.pais,
    region: u.region,
    provincia: u.provincia,
    localidad: u.localidad,
    sitio: u.sitio,
    planta: u.planta,
    oficina: u.oficina,
    lat: u.lat,
    lng: u.lng,
    cantTableros: tablerosPorUbicacion.get(u.id) ?? 0,
    cantRacks: racksPorUbicacion.get(u.id) ?? 0,
    cantEquipos: equiposPorUbicacion.get(u.id) ?? 0,
  }));

  return <ListaUbicaciones ubicaciones={ubicaciones} />;
}
