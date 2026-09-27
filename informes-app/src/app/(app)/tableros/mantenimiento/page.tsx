import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoMantenimientoForm } from "@/components/tableros/nuevo-mantenimiento-form";
import type { TableroConCircuitos } from "@/components/tableros/types";

export default async function NuevoMantenimientoPage() {
  await requireProfile();
  const supabase = await createClient();

  const [tablerosRes, circuitosRes] = await Promise.all([
    supabase.from("tableros").select("id, tipo, denominacion, sitio").order("denominacion"),
    supabase.from("tablero_circuitos").select("id, tablero_id, numero, texto, amp_nominal").order("numero"),
  ]);

  const circuitosPorTablero = new Map<string, TableroConCircuitos["circuitos"]>();
  for (const c of circuitosRes.data ?? []) {
    const lista = circuitosPorTablero.get(c.tablero_id) ?? [];
    lista.push({ id: c.id, numero: c.numero, texto: c.texto, ampNominal: c.amp_nominal ?? "" });
    circuitosPorTablero.set(c.tablero_id, lista);
  }

  const tableros: TableroConCircuitos[] = (tablerosRes.data ?? []).map((t) => ({
    id: t.id,
    tipo: t.tipo,
    denominacion: t.denominacion,
    sitio: t.sitio,
    circuitos: circuitosPorTablero.get(t.id) ?? [],
  }));

  return (
    <div>
      <NuevoMantenimientoForm tableros={tableros} />
    </div>
  );
}
