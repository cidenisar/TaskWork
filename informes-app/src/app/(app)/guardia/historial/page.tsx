import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icon";

const PAGINA = 30;

interface SearchParams {
  anio?: string;
  q?: string;
  limite?: string;
}

function hrefCon(params: Record<string, string | undefined>, base: SearchParams): string {
  const sp = new URLSearchParams();
  const todos = { ...base, ...params };
  if (todos.anio) sp.set("anio", todos.anio);
  if (todos.q) sp.set("q", todos.q);
  if (todos.limite) sp.set("limite", todos.limite);
  const qs = sp.toString();
  return `/guardia/historial${qs ? `?${qs}` : ""}`;
}

export default async function HistorialGuardiaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: anios } = await supabase.from("guardia_evento").select("creado_at").eq("estado", "cerrado").order("creado_at", { ascending: false });
  const aniosDisponibles = [...new Set((anios ?? []).map((e) => new Date(e.creado_at).getFullYear()))];
  const anioActual = aniosDisponibles.includes(Number(sp.anio)) ? Number(sp.anio) : aniosDisponibles[0] ?? new Date().getFullYear();

  const limite = Math.max(PAGINA, Number(sp.limite) || PAGINA);
  const q = sp.q?.trim() ?? "";

  let query = supabase
    .from("guardia_evento")
    .select("id, numero, tipo_alarma, sitio, descripcion, creado_at, cerrado_at", { count: "exact" })
    .eq("estado", "cerrado")
    .gte("creado_at", `${anioActual}-01-01`)
    .lt("creado_at", `${anioActual + 1}-01-01`)
    .order("creado_at", { ascending: false })
    .range(0, limite - 1);
  if (q) query = query.or(`sitio.ilike.%${q}%,descripcion.ilike.%${q}%,tipo_alarma.ilike.%${q}%`);
  const { data: eventos, count } = await query;

  const total = count ?? 0;
  const quedan = Math.max(0, total - (eventos?.length ?? 0));

  return (
    <div>
      <div className="page-heading">
        <h1>Historial</h1>
        <p>Eventos cerrados — {total} en {anioActual}</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <form action="/guardia/historial" method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select name="anio" defaultValue={anioActual}>
            {(aniosDisponibles.length > 0 ? aniosDisponibles : [anioActual]).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input type="text" name="q" defaultValue={q} placeholder="Buscar por sitio, descripción o tipo de alarma..." style={{ flex: 1, minWidth: 200 }} />
          <button type="submit" className="btn btn-secondary btn-sm">
            <Icon name="search" size={13} /> Buscar
          </button>
        </form>
      </div>

      <div className="card">
        <div className="item-list">
          {(eventos ?? []).map((e) => (
            <Link href={`/guardia/evento/${e.id}`} key={e.id} className="list-item" style={{ textDecoration: "none" }}>
              <div className="info">
                <div>
                  <div className="item-name">
                    #{e.numero.toString().padStart(4, "0")} · {e.tipo_alarma}
                  </div>
                  <div className="item-sub">
                    {e.sitio} · {new Date(e.creado_at).toLocaleDateString("es-AR")}
                  </div>
                </div>
              </div>
              <Icon name="chevron-right" size={16} />
            </Link>
          ))}
          {(eventos ?? []).length === 0 && <p className="empty-note">No hay eventos cerrados para este filtro.</p>}
        </div>
        {quedan > 0 && (
          <Link href={hrefCon({ limite: String(limite + PAGINA) }, { anio: String(anioActual), q })} className="btn btn-secondary btn-sm" style={{ marginTop: 10 }}>
            Ver {Math.min(PAGINA, quedan)} más (quedan {quedan})
          </Link>
        )}
      </div>
    </div>
  );
}
