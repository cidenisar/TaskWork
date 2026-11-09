import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarPersonas } from "@/lib/guardia/datos";
import { AREAS_GUARDIA, type AreaGuardia } from "@/lib/guardia/cronograma";
import { EventoGuardiaDetalle, type EventoDetalle, type ParticipacionFila, type NovedadFila } from "@/components/guardia/evento-detalle";
import type { RolParticipacionGuardia } from "@/lib/database.types";

const AREA_POR_ROL: Record<RolParticipacionGuardia, AreaGuardia> = {
  GUARDIA_GENERAL: "General",
  INFRAESTRUCTURA: "Infraestructura",
  DATOS: "Datos",
  ENLACES: "Enlaces",
};

export default async function EventoGuardiaPage({ params }: PageProps<"/guardia/evento/[id]">) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: evento }, { data: participacionesRows }, { data: novedadesRows }, personasTodas] = await Promise.all([
    supabase
      .from("guardia_evento")
      .select("id, numero, estado, tipo_alarma, sitio, descripcion, ticket_tipo, ticket_numero, creado_at, cerrado_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("guardia_participacion")
      .select("id, usuario_id, rol, modalidad, pedido, inicio_at, acepto_at, fin_at, estado")
      .eq("evento_id", id)
      .order("inicio_at", { ascending: true }),
    supabase.from("guardia_novedad").select("id, at, texto, por").eq("evento_id", id).order("at", { ascending: true }),
    cargarPersonas(supabase),
  ]);

  if (!evento) notFound();

  const usuarioIds = [...new Set([...(participacionesRows ?? []).map((p) => p.usuario_id), ...(novedadesRows ?? []).map((n) => n.por).filter((x): x is string => x !== null)])];
  const { data: perfiles } = usuarioIds.length > 0 ? await supabase.from("profiles").select("id, nombre_completo").in("id", usuarioIds) : { data: [] };
  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo]));

  const participaciones: ParticipacionFila[] = (participacionesRows ?? []).map((p) => ({
    id: p.id,
    usuarioId: p.usuario_id,
    nombre: nombrePorId.get(p.usuario_id) ?? "—",
    area: AREA_POR_ROL[p.rol as RolParticipacionGuardia],
    modalidad: p.modalidad,
    pedido: p.pedido,
    inicioAt: p.inicio_at,
    aceptoAt: p.acepto_at,
    finAt: p.fin_at,
    estado: p.estado,
  }));

  const novedades: NovedadFila[] = (novedadesRows ?? []).map((n) => ({
    id: n.id,
    at: n.at,
    texto: n.texto,
    por: n.por ? nombrePorId.get(n.por) ?? "—" : null,
  }));

  const soyGuardiaGeneralDeEste = participaciones.some((p) => p.usuarioId === profile.id && p.area === "General");

  const personasPorArea: Record<AreaGuardia, { id: string; nombre: string }[]> = { General: [], Infraestructura: [], Datos: [], Enlaces: [] };
  for (const area of AREAS_GUARDIA) {
    personasPorArea[area] = personasTodas.filter((p) => p.area === area).map((p) => ({ id: p.id, nombre: nombrePorId.get(p.id) ?? p.id }));
  }
  // Las personas de guardia no siempre tienen su nombre en `nombrePorId` (solo llegaron ahí los que ya participaron) — completar con una consulta aparte si falta alguno.
  const idsFaltantes = Object.values(personasPorArea)
    .flat()
    .filter((p) => p.nombre === p.id)
    .map((p) => p.id);
  if (idsFaltantes.length > 0) {
    const { data: faltantes } = await supabase.from("profiles").select("id, nombre_completo").in("id", idsFaltantes);
    const nombreFaltante = new Map((faltantes ?? []).map((f) => [f.id, f.nombre_completo]));
    for (const area of AREAS_GUARDIA) {
      personasPorArea[area] = personasPorArea[area].map((p) => ({ id: p.id, nombre: nombreFaltante.get(p.id) ?? p.nombre }));
    }
  }

  const eventoDetalle: EventoDetalle = {
    id: evento.id,
    numero: evento.numero,
    estado: evento.estado,
    tipoAlarma: evento.tipo_alarma,
    sitio: evento.sitio,
    descripcion: evento.descripcion,
    ticketTipo: evento.ticket_tipo,
    ticketNumero: evento.ticket_numero,
    creadoAt: evento.creado_at,
    cerradoAt: evento.cerrado_at,
  };

  return (
    <div>
      <div className="page-heading">
        <h1>
          #{evento.numero.toString().padStart(4, "0")} · {evento.tipo_alarma}
        </h1>
        <p>{evento.sitio}</p>
      </div>
      <EventoGuardiaDetalle
        evento={eventoDetalle}
        participaciones={participaciones}
        novedades={novedades}
        miUsuarioId={profile.id}
        soyGuardiaGeneralDeEste={soyGuardiaGeneralDeEste}
        personasPorArea={personasPorArea}
      />
    </div>
  );
}
