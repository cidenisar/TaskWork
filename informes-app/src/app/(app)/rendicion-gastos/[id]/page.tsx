import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RendicionWorkspace } from "@/components/rendicion-gastos/workspace";

export default async function RendicionAbiertaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  // RLS (rendiciones_gastos_select_own) ya limita esto a rendiciones propias.
  const { data: rendicion, error } = await supabase
    .from("rendiciones_gastos")
    .select("numero_generacion, motivo, fecha, proyecto_cliente, provincia, viatico_recibido, moneda, estado, pdf_url")
    .eq("id", id)
    .single();
  if (error || !rendicion) notFound();

  const { data: gastosRows } = await supabase
    .from("gastos")
    .select("id, fecha, categoria, monto, descripcion, comprobante_url")
    .eq("rendicion_id", id)
    .order("fecha");

  const gastoIds = (gastosRows ?? []).map((g) => g.id);
  const { data: gastoTecnicosRows } = gastoIds.length
    ? await supabase.from("gasto_tecnicos").select("gasto_id, tecnico_nombre, torre").in("gasto_id", gastoIds)
    : { data: [] as { gasto_id: string; tecnico_nombre: string; torre: string | null }[] };

  const tecnicosPorGasto = new Map<string, { nombre: string; torre: string | null }[]>();
  for (const gt of gastoTecnicosRows ?? []) {
    const list = tecnicosPorGasto.get(gt.gasto_id) ?? [];
    list.push({ nombre: gt.tecnico_nombre, torre: gt.torre });
    tecnicosPorGasto.set(gt.gasto_id, list);
  }

  const gastos = await Promise.all(
    (gastosRows ?? []).map(async (g) => {
      let comprobanteUrl: string | null = null;
      if (g.comprobante_url) {
        const { data: signed } = await supabase.storage.from("comprobantes").createSignedUrl(g.comprobante_url, 60 * 15);
        comprobanteUrl = signed?.signedUrl ?? null;
      }
      return {
        id: g.id,
        fecha: g.fecha,
        categoria: g.categoria,
        monto: Number(g.monto),
        descripcion: g.descripcion,
        comprobanteUrl,
        tecnicos: tecnicosPorGasto.get(g.id) ?? [],
      };
    }),
  );

  const [categoriasRes, tecnicosRes, torresRes] = await Promise.all([
    supabase.from("catalogo_categorias_gasto").select("nombre").order("nombre"),
    supabase.from("profiles").select("nombre_completo, torre").eq("activo", true).order("nombre_completo"),
    supabase.from("catalogo_torres").select("nombre").order("nombre"),
  ]);

  let pdfUrl: string | null = null;
  if (rendicion.estado === "cerrada" && rendicion.pdf_url) {
    const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(rendicion.pdf_url, 60 * 15);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return (
    <RendicionWorkspace
      rendicionId={id}
      numeroGeneracion={rendicion.numero_generacion}
      motivo={rendicion.motivo}
      fecha={rendicion.fecha}
      proyectoCliente={rendicion.proyecto_cliente}
      provincia={rendicion.provincia}
      viaticoRecibido={Number(rendicion.viatico_recibido)}
      moneda={rendicion.moneda}
      estado={rendicion.estado}
      pdfUrl={pdfUrl}
      gastos={gastos}
      catalogos={{
        provincias: [],
        categoriasGasto: (categoriasRes.data ?? []).map((c) => c.nombre),
        tecnicos: (tecnicosRes.data ?? []).map((t) => ({ nombre: t.nombre_completo, torre: t.torre })),
        torres: (torresRes.data ?? []).map((t) => t.nombre),
      }}
    />
  );
}
