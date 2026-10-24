import { requireProfile } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { labelUbicacion } from "@/components/ubicaciones/types";
import { labelSubsistemas } from "@/components/tableros/types";
import { PlanosQrView, type PlanoTableroRow, type PlanoSalaRow } from "@/components/planos-qr/view";
import type { AdjuntoTableroItem } from "@/components/tableros/adjuntos-tablero";

/**
 * Vive en el Panel de Supervisión (Admin/Supervisor, ver panel/layout.tsx)
 * porque es trabajo de revisión/gestión de escritorio — todos los
 * tableros/salas de todos los sitios en una sola lista, con QR, plano en
 * vivo, PDF/DXF de la última visita y adjuntos, sin entrar a la ficha de
 * cada sitio uno por uno. La CARGA de un adjunto en el momento (desde el
 * celular, parado frente al tablero) sigue disponible para cualquier
 * técnico vía la ficha de Sitio (ubicaciones/[id]) — ahí no se tocó nada.
 */
export default async function PanelPlanosQrPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [tablerosRes, salasRes] = await Promise.all([
    supabase.from("tableros").select("id, denominacion, ubicacion_id, subsistemas").order("denominacion"),
    supabase.from("salas").select("id, denominacion, ubicacion_id, pdf_url").eq("estado", "activo").order("denominacion"),
  ]);
  const tableros = tablerosRes.data ?? [];
  const salas = salasRes.data ?? [];
  const tableroIds = tableros.map((t) => t.id);

  // tablero_mediciones está RLS-scopeado a "las propias, o todas si sos
  // Admin/Supervisor" (ver tablero_mediciones_select_own) — acá ya se
  // garantiza Admin/Supervisor por el layout del Panel, pero igual se usa
  // Service Role para traer el PDF/DXF de CUALQUIER tablero sin depender
  // de quién cargó la última visita (mismo criterio que el visor público
  // por QR).
  let service: ReturnType<typeof createServiceRoleClient> | null = null;
  try {
    service = createServiceRoleClient();
  } catch {
    // Sin SUPABASE_SERVICE_ROLE_KEY configurada la página sigue andando
    // (QR y adjuntos no dependen de esto) — simplemente no hay PDF/DXF.
  }

  const [medicionesRes, adjuntosRes, ubicacionesRes] = await Promise.all([
    service && tableroIds.length > 0
      ? service.from("tablero_mediciones").select("id, tablero_id, fecha, pdf_url, dxf_url").in("tablero_id", tableroIds).order("fecha", { ascending: false })
      : Promise.resolve({ data: [] }),
    tableroIds.length > 0
      ? supabase.from("tablero_adjuntos").select("id, tablero_id, nombre, archivo_url").in("tablero_id", tableroIds).order("created_at")
      : Promise.resolve({ data: [] }),
    (() => {
      const ids = [...new Set([...tableros.map((t) => t.ubicacion_id), ...salas.map((s) => s.ubicacion_id)])];
      return ids.length > 0
        ? supabase.from("ubicaciones").select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng").in("id", ids)
        : Promise.resolve({ data: [] });
    })(),
  ]);

  const ubicacionesPorId = new Map((ubicacionesRes.data ?? []).map((u) => [u.id, u]));

  // Última medición por tablero (igual patrón que la ficha de Sitio): las
  // filas ya vienen ordenadas por fecha desc, así que la primera que se ve
  // de cada tablero_id es la más reciente.
  const ultimaMedicionPorTablero = new Map<string, { id: string; fecha: string; pdfUrl: string | null; dxfUrl: string | null }>();
  for (const m of medicionesRes.data ?? []) {
    if (!ultimaMedicionPorTablero.has(m.tablero_id)) {
      ultimaMedicionPorTablero.set(m.tablero_id, { id: m.id, fecha: m.fecha, pdfUrl: m.pdf_url, dxfUrl: m.dxf_url });
    }
  }

  // Firmadas en bloque (Service Role, mismo motivo de arriba) — el PDF/DXF
  // de la última visita de cada tablero, y el PDF de cada sala.
  const pathsAFirmar = [
    ...[...ultimaMedicionPorTablero.values()].flatMap((m) => [m.pdfUrl, m.dxfUrl].filter((p): p is string => !!p)),
    ...salas.flatMap((s) => (s.pdf_url ? [s.pdf_url] : [])),
  ];
  const urlFirmadaPorPath = new Map<string, string>();
  if (service && pathsAFirmar.length > 0) {
    const { data: firmadas } = await service.storage.from("informes-pdf").createSignedUrls(pathsAFirmar, 60 * 15);
    for (const f of firmadas ?? []) {
      if (f.signedUrl && !f.error && f.path) urlFirmadaPorPath.set(f.path, f.signedUrl);
    }
  }

  // Adjuntos sueltos por tablero — mismas URLs firmadas en bloque que ya usa la ficha de Sitio.
  const adjuntosCrudos = adjuntosRes.data ?? [];
  const adjuntosPorTableroId = new Map<string, AdjuntoTableroItem[]>();
  if (adjuntosCrudos.length > 0) {
    const { data: firmadas } = await supabase.storage.from("informes-pdf").createSignedUrls(
      adjuntosCrudos.map((a) => a.archivo_url),
      60 * 15,
    );
    const urlPorPath = new Map((firmadas ?? []).filter((f) => f.signedUrl && !f.error).map((f) => [f.path ?? "", f.signedUrl]));
    for (const a of adjuntosCrudos) {
      const url = urlPorPath.get(a.archivo_url);
      if (!url) continue;
      const lista = adjuntosPorTableroId.get(a.tablero_id) ?? [];
      lista.push({ id: a.id, nombre: a.nombre, url });
      adjuntosPorTableroId.set(a.tablero_id, lista);
    }
  }

  const filasTableros: PlanoTableroRow[] = tableros.map((t) => {
    const ubicacion = ubicacionesPorId.get(t.ubicacion_id);
    const ultima = ultimaMedicionPorTablero.get(t.id) ?? null;
    return {
      id: t.id,
      denominacion: t.denominacion,
      subsistemasLabel: labelSubsistemas(t.subsistemas),
      ubicacionId: t.ubicacion_id,
      ubicacionLabel: ubicacion ? labelUbicacion(ubicacion) : "—",
      ultimaFecha: ultima?.fecha ?? null,
      pdfUrl: ultima?.pdfUrl ? (urlFirmadaPorPath.get(ultima.pdfUrl) ?? null) : null,
      dxfUrl: ultima?.dxfUrl ? (urlFirmadaPorPath.get(ultima.dxfUrl) ?? null) : null,
      adjuntos: adjuntosPorTableroId.get(t.id) ?? [],
    };
  });

  const filasSalas: PlanoSalaRow[] = salas.map((s) => {
    const ubicacion = ubicacionesPorId.get(s.ubicacion_id);
    return {
      id: s.id,
      denominacion: s.denominacion,
      ubicacionId: s.ubicacion_id,
      ubicacionLabel: ubicacion ? labelUbicacion(ubicacion) : "—",
      pdfUrl: s.pdf_url ? (urlFirmadaPorPath.get(s.pdf_url) ?? null) : null,
    };
  });

  return <PlanosQrView tableros={filasTableros} salas={filasSalas} esAdmin={profile.rol === "admin"} />;
}
