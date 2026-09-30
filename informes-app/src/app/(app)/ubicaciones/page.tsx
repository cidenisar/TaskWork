import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ListaUbicaciones, type UbicacionRow } from "@/components/ubicaciones/lista";

export default async function UbicacionesPage() {
  await requireProfile();
  const supabase = await createClient();

  const [ubicacionesRes, tablerosRes, racksRes] = await Promise.all([
    supabase.from("ubicaciones").select("id, provincia, sector_oficina, sala").order("provincia").order("sala"),
    supabase.from("tableros").select("id, ubicacion_id"),
    supabase.from("racks").select("id, ubicacion_id"),
  ]);

  const tablerosPorUbicacion = new Map<string, number>();
  for (const t of tablerosRes.data ?? []) {
    tablerosPorUbicacion.set(t.ubicacion_id, (tablerosPorUbicacion.get(t.ubicacion_id) ?? 0) + 1);
  }
  const racksPorUbicacion = new Map<string, number>();
  for (const r of racksRes.data ?? []) {
    racksPorUbicacion.set(r.ubicacion_id, (racksPorUbicacion.get(r.ubicacion_id) ?? 0) + 1);
  }

  const ubicaciones: UbicacionRow[] = (ubicacionesRes.data ?? []).map((u) => ({
    id: u.id,
    provincia: u.provincia,
    sectorOficina: u.sector_oficina,
    sala: u.sala,
    cantTableros: tablerosPorUbicacion.get(u.id) ?? 0,
    cantRacks: racksPorUbicacion.get(u.id) ?? 0,
  }));

  return <ListaUbicaciones ubicaciones={ubicaciones} />;
}
