import { createClient } from "@/lib/supabase/server";
import { semanasDelAnio, finSemana, inicioSemana, listaArea, AREAS_GUARDIA, type AreaGuardia } from "@/lib/guardia/cronograma";
import { cargarCronograma, cargarPersonas, cargarParametros } from "@/lib/guardia/datos";
import { horaGuardiaIso } from "@/lib/guardia/reloj";
import { CronogramaGuardiaCard, type SemanaFila, type CambioFila } from "@/components/panel/guardia/cronograma-guardia-card";

const ANIOS = [2026, 2027, 2028];

interface SearchParams {
  anio?: string;
  area?: string;
}

export default async function CronogramaGuardiaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const anio = ANIOS.includes(Number(sp.anio)) ? Number(sp.anio) : new Date().getFullYear();
  const area = (AREAS_GUARDIA as readonly string[]).includes(sp.area ?? "") ? (sp.area as AreaGuardia) : "General";

  const supabase = await createClient();
  const [cronograma, personasTodas, parametros, { data: tecnicos }, { data: cambiosRows }] = await Promise.all([
    cargarCronograma(supabase),
    cargarPersonas(supabase),
    cargarParametros(supabase),
    supabase.from("profiles").select("id, nombre_completo").eq("rol", "tecnico").eq("activo", true).order("nombre_completo"),
    supabase.from("guardia_cambio").select("id, par_id, tipo, area, persona_id, original_id, desde, hasta, motivo, estado, registrado_at").eq("area", area).order("registrado_at", { ascending: false }),
  ]);
  const nombrePorId = new Map((tecnicos ?? []).map((t) => [t.id, t.nombre_completo]));
  const semanaActual = inicioSemana(horaGuardiaIso(), parametros.cambioMin);

  const personasDelArea = listaArea(personasTodas, area).map((id) => ({ id, nombre: nombrePorId.get(id) ?? "—" }));

  const semanas: SemanaFila[] = semanasDelAnio(anio).map((semanaInicio) => {
    const usuarioId = cronograma[semanaInicio]?.[area] ?? null;
    return {
      semanaInicio,
      semanaFin: finSemana(semanaInicio),
      usuarioId,
      nombre: usuarioId ? nombrePorId.get(usuarioId) ?? "—" : null,
      esActual: semanaInicio === semanaActual,
    };
  });

  const cambios: CambioFila[] = (cambiosRows ?? []).map((c) => ({
    id: c.id,
    tipo: c.tipo,
    persona: nombrePorId.get(c.persona_id) ?? "—",
    original: nombrePorId.get(c.original_id) ?? "—",
    desde: c.desde,
    hasta: c.hasta,
    motivo: c.motivo,
    estado: c.estado,
  }));

  return (
    <div>
      <div className="page-heading">
        <h1>Cronograma</h1>
        <p>Programación anual por área, edición semana por semana y cambios de guardia</p>
      </div>
      <CronogramaGuardiaCard
        anios={ANIOS}
        anio={anio}
        area={area}
        semanas={semanas}
        personasDelArea={personasDelArea}
        cambios={cambios}
      />
    </div>
  );
}
