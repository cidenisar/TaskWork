import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusDot } from "@/components/icon";
import type { EstadoNotificacionGuardia, TipoNotificacionGuardia } from "@/lib/database.types";

const PAGINA = 30;

const TIPO_LABEL: Record<TipoNotificacionGuardia, string> = {
  activacion: "Activación",
  cambio_pendiente: "Cambio pendiente",
  cambio_respondido: "Cambio respondido",
  asuncion_semanal: "Asunción semanal",
  viaje_iniciado: "Viaje iniciado",
};

const ESTADO_LABEL: Record<EstadoNotificacionGuardia, string> = {
  pendiente: "Pendiente",
  enviada: "Enviada",
  entregada: "Entregada",
  leida: "Leída",
  fallida: "Fallida",
};

function tono(estado: EstadoNotificacionGuardia): "ok" | "warn" | "danger" {
  if (estado === "leida" || estado === "entregada") return "ok";
  if (estado === "fallida") return "danger";
  return "warn";
}

interface SearchParams {
  estado?: string;
  limite?: string;
}

export default async function AvisosGuardiaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const estadoFiltro = (sp.estado ?? "") as EstadoNotificacionGuardia | "";
  const limite = Math.max(PAGINA, Number(sp.limite) || PAGINA);

  let query = supabase
    .from("guardia_notificacion")
    .select("id, usuario_id, tipo, payload, estado, error, creada_at, enviada_at, entregada_at, leida_at", { count: "exact" })
    .order("creada_at", { ascending: false })
    .range(0, limite - 1);
  if (estadoFiltro) query = query.eq("estado", estadoFiltro);
  const { data: avisos, count } = await query;

  const usuarioIds = [...new Set((avisos ?? []).map((a) => a.usuario_id))];
  const { data: usuarios } = usuarioIds.length > 0 ? await supabase.from("profiles").select("id, nombre_completo").in("id", usuarioIds) : { data: [] };
  const nombrePorId = new Map((usuarios ?? []).map((u) => [u.id, u.nombre_completo]));

  const total = count ?? 0;
  const quedan = Math.max(0, total - (avisos?.length ?? 0));

  return (
    <div>
      <div className="page-heading">
        <h1>Avisos</h1>
        <p>Estado de cada push enviado — para ver si a alguien no le llegó un «Te activaron» ({total} en total)</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form action="/panel/guardia/avisos" method="get" style={{ display: "flex", gap: 8 }}>
          <select name="estado" defaultValue={estadoFiltro}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary btn-sm">
            Filtrar
          </button>
        </form>
      </div>

      <div className="card">
        <div className="item-list">
          {(avisos ?? []).map((a) => (
            <div className="list-item" key={a.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div className="item-name">
                  {nombrePorId.get(a.usuario_id) ?? "—"} <span className="badge">{TIPO_LABEL[a.tipo]}</span>
                </div>
                <div>
                  <StatusDot tone={tono(a.estado)} /> {ESTADO_LABEL[a.estado]}
                </div>
              </div>
              <div className="item-sub">
                {a.payload.title} — {a.payload.body}
              </div>
              <div className="item-sub">
                Creado {new Date(a.creada_at).toLocaleString("es-AR")}
                {a.enviada_at && ` · Enviado ${new Date(a.enviada_at).toLocaleString("es-AR")}`}
                {a.entregada_at && ` · Entregado ${new Date(a.entregada_at).toLocaleString("es-AR")}`}
                {a.leida_at && ` · Leído ${new Date(a.leida_at).toLocaleString("es-AR")}`}
              </div>
              {a.error && <div className="error-text">{a.error}</div>}
            </div>
          ))}
          {(avisos ?? []).length === 0 && <p className="empty-note">No hay avisos para este filtro.</p>}
        </div>
        {quedan > 0 && (
          <Link href={`/panel/guardia/avisos?${estadoFiltro ? `estado=${estadoFiltro}&` : ""}limite=${limite + PAGINA}`} className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>
            Ver {Math.min(PAGINA, quedan)} más (quedan {quedan})
          </Link>
        )}
      </div>
    </div>
  );
}
