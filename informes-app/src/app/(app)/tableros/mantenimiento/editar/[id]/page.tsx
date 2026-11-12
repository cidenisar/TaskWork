import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { NuevoMantenimientoForm } from "@/components/tableros/nuevo-mantenimiento-form";
import { labelUbicacion } from "@/components/ubicaciones/types";
import type { TableroConCircuitos } from "@/components/tableros/types";
import type { TableroCategoriaEquipo } from "@/lib/database.types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function EditarMantenimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  // Solo Administrador puede editar — bypass total de RLS con la service
  // role key (mismo criterio que el borrado, ver eliminarMantenimientoAction).
  const service = createServiceRoleClient();

  const { data: mantenimiento, error } = await service
    .from("tablero_mantenimientos")
    .select("tablero_id, circuito_id, fecha, descripcion, proximo_mantenimiento, foto_url")
    .eq("id", id)
    .single();
  if (error || !mantenimiento) notFound();

  const [tablerosRes, circuitosRes, ubicaciones] = await Promise.all([
    service.from("tableros").select("id, subsistemas, denominacion, ubicacion_id").order("denominacion"),
    service
      .from("tablero_circuitos")
      .select("id, tablero_id, numero, texto, amp_nominal, categoria_equipo, tipo_circuito")
      .eq("estado", "activo")
      .order("numero"),
    fetchTodasLasUbicaciones(service),
  ]);

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
      cuerpo: "",
      alimentadoPorUps: false,
      rolBypassUps: null,
      padreNumero: null,
      etiquetaCable: "",
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
        equipamientoEsperado: [] as TableroCategoriaEquipo[],
        tieneBypassUps: false,
      };
    })
    .filter((t): t is TableroConCircuitos => t !== null);

  let fotoActualUrl: string | null = null;
  if (mantenimiento.foto_url) {
    const { data: signed } = await service.storage.from("informe-fotos").createSignedUrl(mantenimiento.foto_url, 60 * 15);
    fotoActualUrl = signed?.signedUrl ?? null;
  }

  return (
    <div>
      <NuevoMantenimientoForm
        tableros={tableros}
        modo="editar"
        mantenimientoId={id}
        initialValues={{
          tableroId: mantenimiento.tablero_id,
          circuitoId: mantenimiento.circuito_id ?? "",
          fecha: mantenimiento.fecha,
          descripcion: mantenimiento.descripcion,
          proximoMantenimiento: mantenimiento.proximo_mantenimiento ?? "",
        }}
        fotoActualUrl={fotoActualUrl}
      />
    </div>
  );
}
