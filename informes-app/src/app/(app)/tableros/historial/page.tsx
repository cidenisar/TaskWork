import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialTableros, type HistorialMedicionRow } from "@/components/tableros/historial";
import { labelUbicacion } from "@/components/ubicaciones/types";
import type { MantenimientoRow } from "@/components/tableros/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function HistorialTablerosPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // RLS (tablero_mediciones_select_own / tablero_mantenimientos_select_own)
  // ya limita esto a lo propio, o a todo si sos Admin/Supervisor.
  const [medicionesRes, mantenimientosRes] = await Promise.all([
    supabase.from("tablero_mediciones").select("id, numero_generacion, tipo_evento, fecha, pdf_url, tablero_id").order("fecha", { ascending: false }),
    supabase
      .from("tablero_mantenimientos")
      .select("id, tablero_id, circuito_id, fecha, descripcion, foto_url, proximo_mantenimiento")
      .order("fecha", { ascending: false }),
  ]);

  const tableroIds = [
    ...new Set([...(medicionesRes.data ?? []).map((m) => m.tablero_id), ...(mantenimientosRes.data ?? []).map((m) => m.tablero_id)]),
  ];
  const circuitoIds = [...new Set((mantenimientosRes.data ?? []).map((m) => m.circuito_id).filter((id): id is string => !!id))];

  const [tablerosRes, circuitosRes, ubicaciones] = await Promise.all([
    tableroIds.length > 0
      ? supabase.from("tableros").select("id, subsistemas, denominacion, ubicacion_id").in("id", tableroIds)
      : { data: [] },
    circuitoIds.length > 0 ? supabase.from("tablero_circuitos").select("id, texto").in("id", circuitoIds) : { data: [] },
    fetchTodasLasUbicaciones(supabase),
  ]);
  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const tablerosPorId = new Map((tablerosRes.data ?? []).map((t) => [t.id, t]));
  const circuitosPorId = new Map((circuitosRes.data ?? []).map((c) => [c.id, c.texto]));

  const mediciones: HistorialMedicionRow[] = (medicionesRes.data ?? [])
    .map((m) => {
      const t = tablerosPorId.get(m.tablero_id);
      const ubicacion = t ? ubicacionesPorId.get(t.ubicacion_id) : undefined;
      if (!t || !ubicacion) return null;
      return {
        id: m.id,
        numeroGeneracion: m.numero_generacion,
        tipoEvento: m.tipo_evento,
        fecha: m.fecha,
        subsistemas: t.subsistemas,
        denominacion: t.denominacion,
        ubicacionLabel: labelUbicacion(ubicacion),
        pdfDisponible: !!m.pdf_url,
      };
    })
    .filter((r): r is HistorialMedicionRow => r !== null);

  const mantenimientos: MantenimientoRow[] = (mantenimientosRes.data ?? [])
    .map((m) => {
      const t = tablerosPorId.get(m.tablero_id);
      const ubicacion = t ? ubicacionesPorId.get(t.ubicacion_id) : undefined;
      if (!t || !ubicacion) return null;
      return {
        id: m.id,
        tableroId: m.tablero_id,
        tableroDenominacion: t.denominacion,
        tableroUbicacion: labelUbicacion(ubicacion),
        circuitoTexto: m.circuito_id ? (circuitosPorId.get(m.circuito_id) ?? null) : null,
        fecha: m.fecha,
        descripcion: m.descripcion,
        fotoUrl: m.foto_url,
        proximoMantenimiento: m.proximo_mantenimiento,
      };
    })
    .filter((r): r is MantenimientoRow => r !== null);

  return <HistorialTableros mediciones={mediciones} mantenimientos={mantenimientos} esAdmin={profile.rol === "admin"} />;
}
