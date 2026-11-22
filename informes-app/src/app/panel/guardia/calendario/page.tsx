import { createClient } from "@/lib/supabase/server";
import { cargarCronograma, cargarCambiosAceptados, cargarParametros } from "@/lib/guardia/datos";
import { guardiaDe, guardiaSemana, inicioSemana, cambioVigente, AREAS_GUARDIA, type AreaGuardia } from "@/lib/guardia/cronograma";
import { horaGuardiaIso } from "@/lib/guardia/reloj";
import { CalendarioGuardiaCard, type DiaCalendario, type FeriadoNacional } from "@/components/panel/guardia/calendario-guardia-card";
import feriadosArgentina from "@/lib/guardia/feriados-argentina-2026-2027.json";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/** Lunes de esa semana = 1 (como Date.getDay(), pero lunes-primero en vez de domingo-primero). */
function diaSemanaLunesPrimero(anio: number, mes: number, dia: number): number {
  return (new Date(anio, mes - 1, dia).getDay() + 6) % 7;
}

interface SearchParams {
  anio?: string;
  mes?: string;
}

export default async function CalendarioGuardiaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const hoyIso = horaGuardiaIso();
  const hoyAnio = Number(hoyIso.slice(0, 4));
  const hoyMes = Number(hoyIso.slice(5, 7));
  const hoyDia = hoyIso.slice(0, 10);

  const anio = Number(sp.anio) || hoyAnio;
  const mes = Number(sp.mes) || hoyMes;

  const supabase = await createClient();
  const [cronograma, cambios, parametros, personas] = await Promise.all([
    cargarCronograma(supabase),
    cargarCambiosAceptados(supabase),
    cargarParametros(supabase),
    supabase.from("profiles").select("id, nombre_completo").eq("rol", "tecnico"),
  ]);
  const nombrePorId = new Map((personas.data ?? []).map((p) => [p.id, p.nombre_completo]));

  const totalDias = diasDelMes(anio, mes);
  // Todo el año (no solo el mes mostrado): la lista de feriados nacionales de abajo necesita
  // saber qué está marcado en TODO el año, no solo en los días de la grilla de este mes.
  const { data: feriadosMarcados } = await supabase
    .from("guardia_feriado")
    .select("fecha, nombre, origen")
    .gte("fecha", `${anio}-01-01`)
    .lte("fecha", `${anio}-12-31`);
  const marcadoPorFecha = new Map((feriadosMarcados ?? []).map((f) => [f.fecha, f]));

  const feriadosPorAnio = feriadosArgentina as unknown as Record<string, [string, string][]>;
  const nacionalesDelAnio = (feriadosPorAnio[String(anio)] ?? []).map(([fecha, nombre]) => ({
    fecha,
    nombre,
  }));
  const nacionalesSet = new Map(nacionalesDelAnio.map((f) => [f.fecha, f.nombre]));

  const hhmm = `${pad2(Math.floor(parametros.cambioMin / 60))}:${pad2(parametros.cambioMin % 60)}`;
  const dias: DiaCalendario[] = [];
  for (let d = 1; d <= totalDias; d++) {
    const fecha = `${anio}-${pad2(mes)}-${pad2(d)}`;
    const diaSemana = diaSemanaLunesPrimero(anio, mes, d);
    const instanteInicioGuardia = `${fecha}T${hhmm}`;
    const areas = AREAS_GUARDIA.map((area: AreaGuardia) => {
      const usuarioId = guardiaDe(cronograma, cambios, area, instanteInicioGuardia, parametros.cambioMin);
      const sinCambio = guardiaSemana(cronograma, area, inicioSemana(instanteInicioGuardia, parametros.cambioMin));
      const hayCambio = cambioVigente(cambios, area, fecha) !== null || usuarioId !== sinCambio;
      return { area, nombre: usuarioId ? nombrePorId.get(usuarioId) ?? "—" : null, conCambio: hayCambio };
    });
    const marcado = marcadoPorFecha.get(fecha);
    dias.push({
      fecha,
      diaNumero: d,
      diaSemana,
      esFinDeSemana: diaSemana >= 5,
      esHoy: fecha === hoyDia,
      areas,
      feriadoMarcado: marcado ? { nombre: marcado.nombre, origen: marcado.origen } : null,
      feriadoNacionalSinMarcar: !marcado && nacionalesSet.has(fecha) ? (nacionalesSet.get(fecha) as string) : null,
    });
  }

  const nacionales: FeriadoNacional[] = nacionalesDelAnio.map((f) => ({
    fecha: f.fecha,
    nombre: f.nombre,
    marcado: marcadoPorFecha.has(f.fecha),
  }));

  const mesAnterior = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
  const mesSiguiente = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };

  return (
    <div>
      <div className="page-heading">
        <h1>Calendario</h1>
        <p>Quién está de guardia cada día en las cuatro áreas — solo los feriados marcados afectan el cálculo</p>
      </div>
      <CalendarioGuardiaCard
        anio={anio}
        mes={mes}
        mesLabel={MESES[mes - 1]}
        hrefMesAnterior={`/panel/guardia/calendario?anio=${mesAnterior.anio}&mes=${mesAnterior.mes}`}
        hrefMesSiguiente={`/panel/guardia/calendario?anio=${mesSiguiente.anio}&mes=${mesSiguiente.mes}`}
        dias={dias}
        anioNacionales={anio}
        nacionales={nacionales}
      />
    </div>
  );
}
