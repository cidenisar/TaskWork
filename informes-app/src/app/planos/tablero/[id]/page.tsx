import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { labelSubsistemas, TABLERO_EVENTO_LABEL } from "@/components/tableros/types";
import { agruparPorCuerpo, construirUnifilar, type UnifilarCircuito } from "@/lib/tableros/unifilar";

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
 * Visor PÚBLICO del plano unifilar de un tablero — pensado para escanear
 * desde un QR pegado en el gabinete físico, sin login (ver README: el
 * acceso a la planta ya está controlado por YPF, no hace falta duplicar
 * esa barrera acá). Por eso vive FUERA del grupo `(app)` (que exige login
 * en su layout) y usa el cliente service-role, con el código acá mismo
 * limitando qué toca: solo este tablero, su última medición y el catálogo
 * de calibre — nunca la ficha de sitio completa (GPS, otros equipos,
 * vehículos, datos de técnicos).
 *
 * El esquema se recalcula EN VIVO a partir de los circuitos actuales (no
 * se muestra un PDF viejo guardado) para que el QR nunca quede
 * desactualizado, aunque se cargue o edite un circuito después de la
 * última medición.
 *
 * Si quien escanea está LOGUEADO en la app (mismo navegador con sesión
 * activa), además de lo público se muestran accesos directos para cargar
 * una medición o un mantenimiento con este tablero ya preseleccionado —
 * el QR pasa de ser "solo para mirar" a un atajo real al pie del equipo.
 * Para el visitante sin sesión no cambia nada: `getCurrentProfile()` nunca
 * redirige, así que esta página sigue sirviendo igual sin login.
 */
export default async function PlanoTableroPublicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = createServiceRoleClient();

  const { data: tablero } = await service.from("tableros").select("id, denominacion, subsistemas, ubicacion_id").eq("id", id).single();
  if (!tablero) notFound();

  const [{ data: ubicacion }, { data: circuitosRes }, { data: calibreRes }, { data: medicion }, { data: mantenimiento }, profile, { data: adjuntosRes }] =
    await Promise.all([
      service.from("ubicaciones").select("region, provincia, localidad, sitio, planta, oficina").eq("id", tablero.ubicacion_id).single(),
      service
        .from("tablero_circuitos")
        .select("numero, texto, categoria_equipo, tipo_circuito, amp_nominal, cuerpo")
        .eq("tablero_id", id)
        .eq("estado", "activo")
        .order("numero"),
      service.from("catalogo_calibre_cable").select("amperaje_max, calibre_mm2"),
      service
        .from("tablero_mediciones")
        .select("id, fecha, numero_generacion, tipo_evento, pdf_url, dxf_url")
        .eq("tablero_id", id)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle(),
      service.from("tablero_mantenimientos").select("fecha, descripcion").eq("tablero_id", id).order("fecha", { ascending: false }).limit(1).maybeSingle(),
      getCurrentProfile(),
      service.from("tablero_adjuntos").select("id, nombre, archivo_url").eq("tablero_id", id).order("created_at"),
    ]);

  const configCalibre = (calibreRes ?? []).map((c) => ({ amperajeMax: Number(c.amperaje_max), calibreMm2: Number(c.calibre_mm2) }));
  const circuitos: UnifilarCircuito[] = (circuitosRes ?? []).map((c) => ({
    numero: c.numero,
    texto: c.texto,
    categoriaEquipo: c.categoria_equipo,
    tipoCircuito: c.tipo_circuito,
    ampNominal: c.amp_nominal,
    cuerpo: c.cuerpo,
  }));
  const unifilar = construirUnifilar(agruparPorCuerpo(circuitos), configCalibre);

  let pdfUrl: string | null = null;
  let dxfUrl: string | null = null;
  if (medicion?.pdf_url) {
    const { data: signed } = await service.storage.from("informes-pdf").createSignedUrl(medicion.pdf_url, 60 * 15);
    pdfUrl = signed?.signedUrl ?? null;
  }
  if (medicion?.dxf_url) {
    const { data: signed } = await service.storage.from("informes-pdf").createSignedUrl(medicion.dxf_url, 60 * 15);
    dxfUrl = signed?.signedUrl ?? null;
  }

  // Archivos sueltos adjuntados a mano (un unifilar propio, un PDF, una foto del gabinete) — aparte del esquema en
  // vivo de arriba y del PDF/DXF de la última visita.
  const adjuntos = adjuntosRes ?? [];
  let adjuntosConUrl: { id: string; nombre: string; url: string }[] = [];
  if (adjuntos.length > 0) {
    const { data: firmadas } = await service.storage.from("informes-pdf").createSignedUrls(
      adjuntos.map((a) => a.archivo_url),
      60 * 15,
    );
    const urlPorPath = new Map((firmadas ?? []).filter((f) => f.signedUrl && !f.error).map((f) => [f.path ?? "", f.signedUrl]));
    adjuntosConUrl = adjuntos.flatMap((a) => {
      const url = urlPorPath.get(a.archivo_url);
      return url ? [{ id: a.id, nombre: a.nombre, url }] : [];
    });
  }

  return (
    <div className="app">
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 60px" }}>
        <div className="page-heading">
          <h1>{tablero.denominacion}</h1>
          <p>
            {ubicacion ? labelUbicacionBasica(ubicacion) : "—"} · {labelSubsistemas(tablero.subsistemas)}
          </p>
        </div>

        <div className="card">
          <div className="section-label">Estado</div>
          <div className="grid2">
            <div>
              <div className="hint" style={{ margin: 0 }}>Última visita</div>
              <div>
                {medicion
                  ? `${fmtFecha(medicion.fecha)} (${TABLERO_EVENTO_LABEL[medicion.tipo_evento]}, ${medicion.numero_generacion})`
                  : "Sin registrar"}
              </div>
            </div>
            <div>
              <div className="hint" style={{ margin: 0 }}>Último mantenimiento</div>
              <div>{mantenimiento ? fmtFecha(mantenimiento.fecha) : "Sin registrar"}</div>
            </div>
          </div>
          {profile && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <a className="btn btn-primary btn-sm" href={`/tableros/nuevo?tableroId=${id}`}>
                Cargar medición nueva acá
              </a>
              <a className="btn btn-secondary btn-sm" href={`/tableros/mantenimiento?tableroId=${id}`}>
                Registrar mantenimiento acá
              </a>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-label">Esquema Unifilar</div>
          <div className="hint" style={{ margin: "0 0 10px" }}>
            Esquema simplificado a partir de los circuitos relevados — no es un plano a escala. Calibre/color de cable según catálogo
            configurado y cableado de instalación típica para lo que no lleva térmica.
          </div>
          {unifilar.commands.length === 0 ? (
            <div className="empty-note">Este tablero todavía no tiene circuitos relevados.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <svg
                viewBox={`0 0 ${unifilar.width} ${unifilar.height}`}
                width="100%"
                style={{ minWidth: unifilar.width, maxWidth: unifilar.width, height: "auto", display: "block" }}
              >
                {unifilar.commands.map((cmd, i) => {
                  if (cmd.type === "line") {
                    return <line key={i} x1={cmd.x1} y1={cmd.y1} x2={cmd.x2} y2={cmd.y2} stroke="currentColor" strokeWidth={0.75} />;
                  }
                  if (cmd.type === "rect") {
                    return (
                      <rect key={i} x={cmd.x} y={cmd.y} width={cmd.width} height={cmd.height} stroke="currentColor" strokeWidth={0.75} fill="none" />
                    );
                  }
                  return (
                    <text key={i} x={cmd.x} y={cmd.y} fontSize={cmd.size} fontWeight={cmd.bold ? 700 : 400} fill="currentColor">
                      {cmd.text}
                    </text>
                  );
                })}
              </svg>
            </div>
          )}
          {(pdfUrl || dxfUrl) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {pdfUrl && (
                <a className="btn btn-secondary btn-sm" href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  Ver PDF completo de la última visita
                </a>
              )}
              {dxfUrl && (
                <a className="btn btn-secondary btn-sm" href={dxfUrl}>
                  Descargar DXF
                </a>
              )}
            </div>
          )}
          {adjuntosConUrl.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="hint" style={{ margin: "0 0 4px" }}>
                Archivos adjuntos
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {adjuntosConUrl.map((a) => (
                  <a key={a.id} className="btn btn-secondary btn-sm" href={a.url} target="_blank" rel="noopener noreferrer">
                    {a.nombre}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
