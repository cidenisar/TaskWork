import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoMantenimientoForm } from "@/components/tableros/nuevo-mantenimiento-form";
import { labelUbicacion, type Ubicacion } from "@/components/ubicaciones/types";
import type { TableroConCircuitos } from "@/components/tableros/types";

export default async function NuevoMantenimientoPage() {
  await requireProfile();
  const supabase = await createClient();

  const [tablerosRes, circuitosRes, ubicacionesRes] = await Promise.all([
    supabase.from("tableros").select("id, subsistemas, denominacion, ubicacion_id").order("denominacion"),
    supabase
      .from("tablero_circuitos")
      .select("id, tablero_id, numero, texto, amp_nominal, categoria_equipo, tipo_circuito")
      .order("numero"),
    supabase.from("ubicaciones").select("id, provincia, sector_oficina, sala"),
  ]);

  const ubicaciones: Ubicacion[] = (ubicacionesRes.data ?? []).map((u) => ({
    id: u.id,
    provincia: u.provincia,
    sectorOficina: u.sector_oficina,
    sala: u.sala,
  }));
  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));

  const circuitosPorTablero = new Map<string, TableroConCircuitos["circuitos"]>();
  for (const c of circuitosRes.data ?? []) {
    const lista = circuitosPorTablero.get(c.tablero_id) ?? [];
    lista.push({
      id: c.id,
      numero: c.numero,
      texto: c.texto,
      ampNominal: c.amp_nominal ?? "",
      categoriaEquipo: c.categoria_equipo,
      tipoCircuito: c.tipo_circuito,
    });
    circuitosPorTablero.set(c.tablero_id, lista);
  }

  const tableros: TableroConCircuitos[] = (tablerosRes.data ?? [])
    .map((t) => {
      const ubicacion = ubicacionesPorId.get(t.ubicacion_id);
      if (!ubicacion) return null;
      return {
        id: t.id,
        subsistemas: t.subsistemas,
        denominacion: t.denominacion,
        ubicacionId: t.ubicacion_id,
        ubicacionLabel: labelUbicacion(ubicacion),
        circuitos: circuitosPorTablero.get(t.id) ?? [],
      };
    })
    .filter((t): t is TableroConCircuitos => t !== null);

  return (
    <div>
      <NuevoMantenimientoForm tableros={tableros} />
    </div>
  );
}
