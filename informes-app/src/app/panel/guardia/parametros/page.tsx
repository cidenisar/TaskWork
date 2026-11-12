import { createClient } from "@/lib/supabase/server";
import { ParametrosGuardiaCard } from "@/components/panel/guardia/parametros-guardia-card";
import { TiposAlarmaCard } from "@/components/panel/guardia/tipos-alarma-card";

export default async function ParametrosGuardiaPage() {
  const supabase = await createClient();
  const [{ data: config }, { data: hist }, { data: tiposAlarma }] = await Promise.all([
    supabase
      .from("guardia_config")
      .select(
        "entrada_min, salida_activacion_min, madrugada_hasta_min, tope_media_min, valor_media, valor_entera, cambio_min, periodo_desde, periodo_hasta, grupo_whatsapp_nombre",
      )
      .eq("id", 1)
      .single(),
    supabase.from("guardia_config_hist").select("id, campo, antes, despues, quien, cuando").order("cuando", { ascending: false }).limit(30),
    supabase.from("guardia_tipo_alarma").select("id, nombre, activo").order("nombre"),
  ]);

  const quienIds = [...new Set((hist ?? []).map((h) => h.quien).filter((id): id is string => id !== null))];
  const { data: quienes } =
    quienIds.length > 0 ? await supabase.from("profiles").select("id, nombre_completo").in("id", quienIds) : { data: [] };
  const nombrePorId = new Map((quienes ?? []).map((q) => [q.id, q.nombre_completo]));

  const { data: cierreVigente } =
    config?.periodo_desde && config?.periodo_hasta
      ? await supabase
          .from("guardia_periodo_cierre")
          .select("id")
          .eq("tipo", "global")
          .eq("desde", config.periodo_desde)
          .eq("hasta", config.periodo_hasta)
          .maybeSingle()
      : { data: null };

  return (
    <div>
      <div className="page-heading">
        <h1>Parámetros</h1>
        <p>Nada clavado en el código — un cambio vale hacia adelante, nunca mueve un período ya cerrado</p>
      </div>
      <ParametrosGuardiaCard
        config={
          config ?? {
            entrada_min: 450,
            salida_activacion_min: 1020,
            madrugada_hasta_min: 450,
            tope_media_min: 270,
            valor_media: 50,
            valor_entera: 100,
            cambio_min: 600,
            periodo_desde: "",
            periodo_hasta: "",
            grupo_whatsapp_nombre: "Novedades Guardia TI Cuyo",
          }
        }
        historial={(hist ?? []).map((h) => ({
          id: h.id,
          campo: h.campo,
          antes: h.antes,
          despues: h.despues,
          quien: (h.quien && nombrePorId.get(h.quien)) ?? "—",
          cuando: h.cuando,
        }))}
        periodoCerrado={!!cierreVigente}
      />
      <TiposAlarmaCard tipos={tiposAlarma ?? []} />
    </div>
  );
}
