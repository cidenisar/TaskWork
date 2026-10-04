import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ListaUbicaciones, type UbicacionRow } from "@/components/ubicaciones/lista";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function UbicacionesPage() {
  await requireProfile();
  const supabase = await createClient();

  const [ubicacionesData, tablerosRes, racksRes, equiposRes, informesRes, rendicionesRes] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("tableros").select("id, ubicacion_id"),
    supabase.from("racks").select("id, ubicacion_id"),
    supabase.from("equipos").select("id, ubicacion_id"),
    // RLS ya limita esto a informes/rendiciones propios, o todos si sos Admin/Supervisor.
    supabase.from("informes_tecnicos").select("id, ubicacion_id").not("ubicacion_id", "is", null),
    supabase.from("rendiciones_gastos").select("id, ubicacion_id").not("ubicacion_id", "is", null),
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
  const informesPorUbicacion = new Map<string, number>();
  for (const i of informesRes.data ?? []) {
    if (!i.ubicacion_id) continue;
    informesPorUbicacion.set(i.ubicacion_id, (informesPorUbicacion.get(i.ubicacion_id) ?? 0) + 1);
  }
  const rendicionesPorUbicacion = new Map<string, number>();
  for (const r of rendicionesRes.data ?? []) {
    if (!r.ubicacion_id) continue;
    rendicionesPorUbicacion.set(r.ubicacion_id, (rendicionesPorUbicacion.get(r.ubicacion_id) ?? 0) + 1);
  }

  // El catálogo trae ~1747 sitios precargados de toda Argentina (para elegir
  // al relevar) — mostrarlos todos acá sería puro ruido. Esta pantalla es un
  // mapa de "dónde ya cargamos algo" (tableros, racks, equipos, informes
  // técnicos y rendiciones de gastos), así que solo se listan las que tienen
  // al menos uno de esos. Los informes/rendiciones viejos que se cargaron
  // sin elegir una Ubicación estructurada (texto libre) no cuentan acá
  // todavía — no se migraron automáticamente, ver README.
  const ubicaciones: UbicacionRow[] = ubicacionesData
    .map((u) => ({
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
      cantInformes: informesPorUbicacion.get(u.id) ?? 0,
      cantRendiciones: rendicionesPorUbicacion.get(u.id) ?? 0,
    }))
    .filter((u) => u.cantTableros > 0 || u.cantRacks > 0 || u.cantEquipos > 0 || u.cantInformes > 0 || u.cantRendiciones > 0);

  return <ListaUbicaciones ubicaciones={ubicaciones} />;
}
