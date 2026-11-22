import type { createClient } from "@/lib/supabase/server";
import { labelUbicacion, type Ubicacion } from "@/components/ubicaciones/types";
import { CATEGORIA_EQUIPO_LABEL } from "@/components/equipos/types";
import type { EquipoCategoria, EstadoEquipamiento } from "@/lib/database.types";

/**
 * Búsqueda de "¿dónde se usó este material?" — cubre los dos caminos por
 * los que un material entra a la app (ver CRITERIOS_Y_IDEAS.md):
 * 1. Equipos individuales (cámara, lectora, fuente — con marca/modelo/N°
 *    de serie), dados de alta en `equipos` desde Equipos Individuales o
 *    desde la sección Materiales de Informe Técnico.
 * 2. Materiales a granel del remito (cañería, bulonería, cable — sin alta
 *    de equipo propia), guardados en `informe_remito_items`.
 */

const LIMITE = 50;

const ESTADO_EQUIPO_LABEL: Record<EstadoEquipamiento, string> = {
  activo: "Activo",
  baja: "De baja",
  en_deposito: "En depósito",
};

export interface ResultadoEquipoBusqueda {
  id: string;
  texto: string;
  categoriaLabel: string;
  marcaModelo: string | null;
  numeroSerie: string | null;
  etiquetaYpf: string | null;
  ubicacionLabel: string;
  estadoLabel: string;
  creadoEn: string;
}

export interface ResultadoMaterialRemitoBusqueda {
  id: string;
  descripcion: string;
  cantidadEsperada: number;
  cantidadSobrante: number;
  informeId: string;
  informeNumeroGeneracion: string;
  informeFecha: string;
  ubicacionLabel: string;
  pdfDisponible: boolean;
}

export interface ResultadoBusquedaMateriales {
  equipos: ResultadoEquipoBusqueda[];
  materialesRemito: ResultadoMaterialRemitoBusqueda[];
}

export async function buscarMateriales(supabase: Awaited<ReturnType<typeof createClient>>, query: string): Promise<ResultadoBusquedaMateriales> {
  const q = query.trim();
  if (q.length < 2) return { equipos: [], materialesRemito: [] };
  const likeQ = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const [equiposRes, remitoRes] = await Promise.all([
    supabase
      .from("equipos")
      .select("id, texto, categoria_equipo, marca_modelo, numero_serie, etiqueta_ypf, ubicacion_id, estado, created_at")
      .or(`texto.ilike.${likeQ},numero_serie.ilike.${likeQ},etiqueta_ypf.ilike.${likeQ},marca_modelo.ilike.${likeQ}`)
      .order("created_at", { ascending: false })
      .limit(LIMITE),
    supabase
      .from("informe_remito_items")
      .select("id, informe_id, descripcion, cantidad_esperada, cantidad_sobrante, created_at")
      .ilike("descripcion", likeQ)
      .order("created_at", { ascending: false })
      .limit(LIMITE),
  ]);

  const equiposData = equiposRes.data ?? [];
  const remitoData = remitoRes.data ?? [];

  const informeIds = [...new Set(remitoData.map((r) => r.informe_id))];
  const informesRes = informeIds.length
    ? await supabase.from("informes_tecnicos").select("id, numero_generacion, fecha, ubicacion_id, pdf_url, estado").in("id", informeIds)
    : { data: [] as { id: string; numero_generacion: string; fecha: string; ubicacion_id: string | null; pdf_url: string | null; estado: string }[] };
  const informesPorId = new Map((informesRes.data ?? []).map((i) => [i.id, i]));

  const ubicacionIds = new Set<string>();
  for (const e of equiposData) ubicacionIds.add(e.ubicacion_id);
  for (const i of informesRes.data ?? []) if (i.ubicacion_id) ubicacionIds.add(i.ubicacion_id);

  const ubicacionesRes = ubicacionIds.size
    ? await supabase.from("ubicaciones").select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng").in("id", [...ubicacionIds])
    : { data: [] as Ubicacion[] };
  const labelPorUbicacion = new Map((ubicacionesRes.data ?? []).map((u) => [u.id, labelUbicacion(u as Ubicacion)]));

  const equipos: ResultadoEquipoBusqueda[] = equiposData.map((e) => ({
    id: e.id,
    texto: e.texto,
    categoriaLabel: CATEGORIA_EQUIPO_LABEL[e.categoria_equipo as EquipoCategoria] ?? e.categoria_equipo,
    marcaModelo: e.marca_modelo,
    numeroSerie: e.numero_serie,
    etiquetaYpf: e.etiqueta_ypf,
    ubicacionLabel: labelPorUbicacion.get(e.ubicacion_id) ?? "—",
    estadoLabel: ESTADO_EQUIPO_LABEL[e.estado as EstadoEquipamiento] ?? e.estado,
    creadoEn: e.created_at,
  }));

  const materialesRemito: ResultadoMaterialRemitoBusqueda[] = remitoData.map((r) => {
    const informe = informesPorId.get(r.informe_id);
    return {
      id: r.id,
      descripcion: r.descripcion,
      cantidadEsperada: r.cantidad_esperada,
      cantidadSobrante: r.cantidad_sobrante,
      informeId: r.informe_id,
      informeNumeroGeneracion: informe?.numero_generacion ?? "—",
      informeFecha: informe?.fecha ?? "",
      ubicacionLabel: informe?.ubicacion_id ? (labelPorUbicacion.get(informe.ubicacion_id) ?? "—") : "—",
      pdfDisponible: informe?.estado === "generado" && !!informe?.pdf_url,
    };
  });

  return { equipos, materialesRemito };
}
