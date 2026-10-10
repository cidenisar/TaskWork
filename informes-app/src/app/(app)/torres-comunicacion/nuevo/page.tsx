import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoRelevamientoForm } from "@/components/torres-comunicacion/nuevo-relevamiento-form";
import { labelUbicacion } from "@/components/ubicaciones/types";
import type { TorreConEquipamiento } from "@/components/torres-comunicacion/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function NuevoRelevamientoTorreComunicacionPage() {
  await requireProfile();
  const supabase = await createClient();

  const [torresRes, equipamientosRes, ubicaciones, provinciasRes, largosTramoRes] = await Promise.all([
    supabase.from("torres_comunicacion").select("id, denominacion, tipo_torre, tramos_contados, altura_estimada_m, ubicacion_id").order("denominacion"),
    supabase
      .from("torre_comunicacion_equipamientos")
      .select("id, torre_id, numero, categoria_equipo, texto, marca_modelo, altura_m, etiqueta_ypf, cantidad, consumo_promedio_w, consumo_max_w")
      .eq("estado", "activo")
      .order("numero"),
    fetchTodasLasUbicaciones(supabase),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    supabase.from("torre_tipo_largos").select("tipo_torre, largo_tramo_m"),
  ]);

  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const provincias = (provinciasRes.data ?? []).map((p) => p.nombre);
  const largosTramoM = Object.fromEntries((largosTramoRes.data ?? []).map((l) => [l.tipo_torre, Number(l.largo_tramo_m)])) as Partial<
    Record<NonNullable<TorreConEquipamiento["tipoTorre"]>, number>
  >;

  const equipamientoPorTorre = new Map<string, TorreConEquipamiento["equipamiento"]>();
  for (const e of equipamientosRes.data ?? []) {
    const lista = equipamientoPorTorre.get(e.torre_id) ?? [];
    lista.push({
      id: e.id,
      numero: e.numero,
      categoriaEquipo: e.categoria_equipo,
      texto: e.texto,
      marcaModelo: e.marca_modelo ?? "",
      alturaM: e.altura_m ?? "",
      etiquetaYpf: e.etiqueta_ypf ?? "",
      cantidad: e.cantidad,
      consumoPromedioW: e.consumo_promedio_w,
      consumoMaxW: e.consumo_max_w,
    });
    equipamientoPorTorre.set(e.torre_id, lista);
  }

  const torres: TorreConEquipamiento[] = (torresRes.data ?? [])
    .map((t) => {
      const ubicacion = ubicacionesPorId.get(t.ubicacion_id);
      if (!ubicacion) return null;
      return {
        id: t.id,
        denominacion: t.denominacion,
        tipoTorre: t.tipo_torre,
        tramosContados: t.tramos_contados,
        alturaEstimadaM: t.altura_estimada_m,
        ubicacionId: t.ubicacion_id,
        ubicacionLabel: labelUbicacion(ubicacion),
        equipamiento: equipamientoPorTorre.get(t.id) ?? [],
      };
    })
    .filter((t): t is TorreConEquipamiento => t !== null);

  return (
    <div>
      <NuevoRelevamientoForm torres={torres} ubicaciones={ubicaciones} provincias={provincias} largosTramoM={largosTramoM} />
    </div>
  );
}
