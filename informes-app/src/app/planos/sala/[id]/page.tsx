import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { SALA_TIPO_CONSTRUCCION_LABEL } from "@/components/salas/types";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

function labelUbicacionBasica(u: { oficina: string | null; planta: string | null; sitio: string; localidad: string | null; provincia: string }) {
  const partes: string[] = [];
  for (const nivel of [u.oficina, u.planta, u.sitio, u.localidad, u.provincia]) {
    const v = nivel?.trim();
    if (v && partes[partes.length - 1] !== v) partes.push(v);
  }
  return partes.join(" · ");
}

/**
 * Visor PÚBLICO de una Sala/Shelter/Container — mismo criterio que el de
 * Tableros (`/planos/tablero/[id]`, ver ese archivo para el porqué de no
 * pedir login): pensado para escanear desde el QR pegado en la puerta, sin
 * login, con la misma barrera real (acceso a planta controlado por YPF).
 *
 * A diferencia de Tableros, Salas no tiene un "plano" que mostrar (no hay
 * esquema eléctrico de un ambiente) — el visor muestra identificación,
 * fotos del alta y estado (última visita/mantenimiento). El mantenimiento
 * de Salas usa el Plan de Mantenimiento genérico, que solo se carga desde
 * un modal inline en la ficha de Sitio (no tiene una página propia como
 * `/tableros/mantenimiento`) — por eso el atajo para el técnico logueado
 * no lo prefiliza directamente, lo manda a la fila de esta sala en la
 * ficha de Sitio (anchor `#sala-{id}`).
 */
export default async function PlanoSalaPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createServiceRoleClient();

  const { data: sala } = await service
    .from("salas")
    .select("id, denominacion, tipo_construccion, ubicacion_id, pdf_url")
    .eq("id", id)
    .single();
  if (!sala) notFound();

  const [{ data: ubicacion }, { data: mantenimiento }, profile] = await Promise.all([
    service.from("ubicaciones").select("region, provincia, localidad, sitio, planta, oficina").eq("id", sala.ubicacion_id).single(),
    service
      .from("mantenimientos_equipamiento")
      .select("fecha, descripcion")
      .eq("tipo_equipo", "sala")
      .eq("equipo_id", id)
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getCurrentProfile(),
  ]);

  let pdfUrl: string | null = null;
  if (sala.pdf_url) {
    const { data: signed } = await service.storage.from("informes-pdf").createSignedUrl(sala.pdf_url, 60 * 15);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="app">
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 60px" }}>
        <div className="page-heading">
          <h1>{sala.denominacion}</h1>
          <p>
            {ubicacion ? labelUbicacionBasica(ubicacion) : "—"} · {SALA_TIPO_CONSTRUCCION_LABEL[sala.tipo_construccion]}
          </p>
        </div>

        <div className="card">
          <div className="section-label">Estado</div>
          <div>Último mantenimiento: {mantenimiento ? `${fmtFecha(mantenimiento.fecha)}${mantenimiento.descripcion ? ` — ${mantenimiento.descripcion}` : ""}` : "Sin registrar"}</div>
          {profile && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <a className="btn btn-primary btn-sm" href={`/ubicaciones/${sala.ubicacion_id}#sala-${id}`}>
                Registrar mantenimiento acá
              </a>
            </div>
          )}
        </div>

        {pdfUrl && (
          <div className="card">
            <a className="btn btn-secondary btn-sm" href={pdfUrl} target="_blank" rel="noopener noreferrer">
              Ver PDF del relevamiento
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
