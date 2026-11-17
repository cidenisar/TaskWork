import type { createClient } from "@/lib/supabase/server";
import type { EstadoTarea, MotivoCierreTarea, TipoEquipoBaja } from "@/lib/database.types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const TAMAÑO_PAGINA = 1000;
const TAMAÑO_LOTE_IDS = 100;
/** Cuántas tareas ya cerradas se muestran en la solapa "Cerradas" (las más recientes). */
const MAX_CERRADAS = 100;

export interface TareaPanel {
  id: string;
  texto: string;
  estado: EstadoTarea;
  motivo_cierre: MotivoCierreTarea | null;
  comentario_cierre: string | null;
  cerrada_at: string | null;
  cerradaPor: string | null;
  created_at: string;
  informe: { id: string; numero: string; titulo: string } | null;
  /** Informe de la visita donde se resolvió (solo si motivo_cierre = resuelta_en_visita). */
  informeCierre: { id: string; numero: string } | null;
  /** Equipo al que está vinculada (texto actual del equipo; null si no tiene o ya no existe). */
  equipo: { tipo: TipoEquipoBaja; id: string; texto: string } | null;
  ubicacionId: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
}

const CAMPOS = "id, texto, estado, motivo_cierre, comentario_cierre, cerrada_at, cerrada_por, created_at, informe_id, informe_cierre_id, equipo_tipo, equipo_id, ubicacion_id";

async function enLotes<T>(ids: string[], consulta: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const unicos = [...new Set(ids)];
  const salida: T[] = [];
  for (let i = 0; i < unicos.length; i += TAMAÑO_LOTE_IDS) salida.push(...(await consulta(unicos.slice(i, i + TAMAÑO_LOTE_IDS))));
  return salida;
}

/**
 * Todas las tareas ABIERTAS (paginando: un select sin range se corta en
 * silencio a las 1000 filas) más las últimas cerradas, ya con la ubicación, el
 * informe de origen y quién las cerró. Los tipos de la base no declaran
 * relaciones, por eso se juntan con consultas aparte en vez de un join.
 */
export async function cargarTareasPanel(supabase: Supabase): Promise<TareaPanel[]> {
  const filas: {
    id: string;
    texto: string;
    estado: EstadoTarea;
    motivo_cierre: MotivoCierreTarea | null;
    comentario_cierre: string | null;
    cerrada_at: string | null;
    cerrada_por: string | null;
    created_at: string;
    informe_id: string | null;
    informe_cierre_id: string | null;
    equipo_tipo: TipoEquipoBaja | null;
    equipo_id: string | null;
    ubicacion_id: string;
  }[] = [];

  for (let desde = 0; ; desde += TAMAÑO_PAGINA) {
    const { data, error } = await supabase
      .from("tareas_pendientes")
      .select(CAMPOS)
      .eq("estado", "abierta")
      .order("created_at")
      .order("id")
      .range(desde, desde + TAMAÑO_PAGINA - 1);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < TAMAÑO_PAGINA) break;
  }
  const { data: cerradas, error: errCerradas } = await supabase
    .from("tareas_pendientes")
    .select(CAMPOS)
    .neq("estado", "abierta")
    .order("cerrada_at", { ascending: false })
    .limit(MAX_CERRADAS);
  if (errCerradas) throw errCerradas;
  filas.push(...(cerradas ?? []));

  const idsEquipo = (tipo: TipoEquipoBaja) => filas.flatMap((f) => (f.equipo_tipo === tipo && f.equipo_id ? [f.equipo_id] : []));
  const textosEquipo = (tabla: "equipos" | "rack_equipamientos" | "tablero_circuitos", ids: string[]) =>
    enLotes(ids, async (lote) => {
      const { data, error } = await supabase.from(tabla).select("id, texto").in("id", lote);
      if (error) throw error;
      return data ?? [];
    });

  const [ubicaciones, informes, personas, eqSueltos, eqRack, eqCircuitos] = await Promise.all([
    enLotes(
      filas.map((f) => f.ubicacion_id),
      async (lote) => {
        const { data, error } = await supabase.from("ubicaciones").select("id, region, provincia, localidad, sitio, planta, oficina").in("id", lote);
        if (error) throw error;
        return data ?? [];
      },
    ),
    enLotes(
      filas.flatMap((f) => [f.informe_id, f.informe_cierre_id].filter((x): x is string => !!x)),
      async (lote) => {
        const { data, error } = await supabase.from("informes_tecnicos").select("id, numero_generacion, titulo").in("id", lote);
        if (error) throw error;
        return data ?? [];
      },
    ),
    enLotes(
      filas.flatMap((f) => (f.cerrada_por ? [f.cerrada_por] : [])),
      async (lote) => {
        const { data, error } = await supabase.from("profiles").select("id, nombre_completo").in("id", lote);
        if (error) throw error;
        return data ?? [];
      },
    ),
    textosEquipo("equipos", idsEquipo("equipo_individual")),
    textosEquipo("rack_equipamientos", idsEquipo("rack_equipamiento")),
    textosEquipo("tablero_circuitos", idsEquipo("tablero_circuito")),
  ]);
  const textoEquipoPorId = new Map([...eqSueltos, ...eqRack, ...eqCircuitos].map((e) => [e.id, e.texto]));
  const ubicacionPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const informePorId = new Map(informes.map((i) => [i.id, i]));
  const nombrePorId = new Map(personas.map((p) => [p.id, p.nombre_completo]));

  return filas.flatMap((f) => {
    const u = ubicacionPorId.get(f.ubicacion_id);
    if (!u) return []; // la ubicación ya no existe (se borra en cascada): no hay dónde mostrarla
    const inf = f.informe_id ? informePorId.get(f.informe_id) : undefined;
    const infCierre = f.informe_cierre_id ? informePorId.get(f.informe_cierre_id) : undefined;
    return [
      {
        id: f.id,
        texto: f.texto,
        estado: f.estado,
        motivo_cierre: f.motivo_cierre,
        comentario_cierre: f.comentario_cierre,
        cerrada_at: f.cerrada_at,
        cerradaPor: f.cerrada_por ? (nombrePorId.get(f.cerrada_por) ?? null) : null,
        created_at: f.created_at,
        informe: inf ? { id: inf.id, numero: inf.numero_generacion, titulo: inf.titulo } : null,
        informeCierre: infCierre ? { id: infCierre.id, numero: infCierre.numero_generacion } : null,
        equipo: f.equipo_tipo && f.equipo_id && textoEquipoPorId.has(f.equipo_id) ? { tipo: f.equipo_tipo, id: f.equipo_id, texto: textoEquipoPorId.get(f.equipo_id)! } : null,
        ubicacionId: f.ubicacion_id,
        region: u.region,
        provincia: u.provincia,
        localidad: u.localidad,
        sitio: u.sitio,
        planta: u.planta,
        oficina: u.oficina,
      },
    ];
  });
}
