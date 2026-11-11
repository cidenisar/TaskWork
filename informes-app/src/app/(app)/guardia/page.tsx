import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { cargarAreaDe } from "@/lib/guardia/datos";
import { esGuardiaGeneral, esDeGuardia } from "@/lib/guardia/permisos";
import { horaGuardiaIso } from "@/lib/guardia/reloj";
import { Icon, StatusDot } from "@/components/icon";
import { BotonFeriadoHoy } from "@/components/guardia/boton-feriado-hoy";
import { CambiosPendientes, type CambioPendiente } from "@/components/guardia/cambios-pendientes";
import { AsuncionSemanal } from "@/components/guardia/asuncion-semanal";

export default async function GuardiaPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const area = await cargarAreaDe(supabase, profile.id);
  const ctx = { rol: profile.rol, area };

  if (!esDeGuardia(ctx) && profile.rol === "tecnico") {
    return (
      <div className="card">
        <p className="empty-note">No estás asignado a ninguna guardia. Si esto no es correcto, pedile a tu responsable que te asigne en Personas.</p>
      </div>
    );
  }

  const esGG = esGuardiaGeneral(ctx);
  const hoy = horaGuardiaIso().slice(0, 10);

  const [{ data: eventos }, { data: cambiosRows }, { data: feriadoHoy }, { data: asuncionPendiente }] = await Promise.all([
    supabase
      .from("guardia_evento")
      .select("id, numero, estado, tipo_alarma, sitio, creado_at")
      .eq("estado", "abierto")
      .order("creado_at", { ascending: false }),
    esDeGuardia(ctx)
      ? supabase
          .from("guardia_cambio")
          .select("id, area, original_id, desde, hasta, motivo")
          .eq("persona_id", profile.id)
          .eq("estado", "pendiente")
      : Promise.resolve({ data: [] }),
    esGG ? supabase.from("guardia_feriado").select("fecha").eq("fecha", hoy).maybeSingle() : Promise.resolve({ data: null }),
    esDeGuardia(ctx)
      ? supabase.from("guardia_asuncion").select("semana_inicio, area").eq("usuario_id", profile.id).is("asumio_at", null).order("semana_inicio", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const originalIds = [...new Set((cambiosRows ?? []).map((c) => c.original_id))];
  const { data: originales } = originalIds.length > 0 ? await supabase.from("profiles").select("id, nombre_completo").in("id", originalIds) : { data: [] };
  const nombrePorId = new Map((originales ?? []).map((p) => [p.id, p.nombre_completo]));
  const cambiosPendientes: CambioPendiente[] = (cambiosRows ?? []).map((c) => ({
    id: c.id,
    area: c.area,
    original: nombrePorId.get(c.original_id) ?? "—",
    desde: c.desde,
    hasta: c.hasta,
    motivo: c.motivo,
  }));

  return (
    <div>
      <div className="page-heading">
        <h1>Guardia General</h1>
        <p>{area ? `Vos hacés la guardia de ${area}` : "Vista de oficina"}</p>
      </div>

      {asuncionPendiente && <AsuncionSemanal semanaInicio={asuncionPendiente.semana_inicio} area={asuncionPendiente.area} />}

      <CambiosPendientes cambios={cambiosPendientes} />

      {esGG && (
        <div className="card" style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <Link href="/guardia/nuevo" className="btn btn-primary">
            <Icon name="bell" size={14} /> Registrar llamada
          </Link>
          <BotonFeriadoHoy yaMarcado={!!feriadoHoy} />
        </div>
      )}

      <div className="card">
        <div className="section-label">Eventos abiertos</div>
        <div className="item-list">
          {(eventos ?? []).map((e) => (
            <Link href={`/guardia/evento/${e.id}`} key={e.id} className="list-item" style={{ textDecoration: "none" }}>
              <div className="info">
                <div>
                  <div className="item-name">
                    #{e.numero.toString().padStart(4, "0")} · {e.tipo_alarma}
                    <span className="venc-badge ok">
                      <StatusDot tone="ok" /> Abierto
                    </span>
                  </div>
                  <div className="item-sub">{e.sitio}</div>
                </div>
              </div>
              <Icon name="chevron-right" size={16} />
            </Link>
          ))}
          {(eventos ?? []).length === 0 && <p className="empty-note">No hay eventos abiertos ahora mismo.</p>}
        </div>
      </div>
    </div>
  );
}
