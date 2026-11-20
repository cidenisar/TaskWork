import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { PROVEEDORES_IA } from "@/lib/ai/motor";
import { compararLectura, porcentaje, type CampoComparado, type ComparacionLectura } from "@/lib/ai/comparar";
import type { IaLecturaRow } from "@/lib/database.types";

const FUNCION: Record<string, string> = {
  "rendicion-gastos/leer-tickets": "Tickets de gastos",
  "equipos/leer-foto": "Equipos (foto)",
  "racks/leer-foto": "Racks (foto)",
  "racks/leer-campo": "Racks (un campo)",
  "torres-comunicacion/leer-foto": "Torres de comunicaciones (foto)",
  "entregas-deposito/leer-foto": "Entregas a depósito (foto)",
  "informe-tecnico/leer-remito": "Informe técnico: remito",
  "informe-tecnico/verificar-instalacion": "Informe técnico: verificar instalación",
  "vehiculos/leer-tablero": "Vehículos: tablero",
  "vehiculos/leer-exterior": "Vehículos: exterior",
  "vehiculos/leer-vencimiento-seguridad": "Vehículos: vencimiento",
  "vehiculos/comparar-estado": "Vehículos: comparar estado",
};

const nombreFuncion = (endpoint: string) => FUNCION[endpoint] ?? endpoint;
const nombreIa = (id: string) => (id === "resultado" ? "Votado" : (PROVEEDORES_IA.find((p) => p.id === id)?.nombre ?? id));
const ordenIa = (id: string) => PROVEEDORES_IA.findIndex((p) => p.id === id);

function fmtCampo(v: unknown): string {
  if (v === undefined) return "(no vino)";
  if (v === null || v === "") return "vacío";
  return String(v);
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Acum = { lecturas: number; comparados: number; coinciden: number };

function sumar(mapa: Map<string, Acum>, id: string, comparados: number, coinciden: number) {
  const a = mapa.get(id) ?? { lecturas: 0, comparados: 0, coinciden: 0 };
  a.lecturas += 1;
  a.comparados += comparados;
  a.coinciden += coinciden;
  mapa.set(id, a);
}

function celdaPorcentaje(a: Acum | undefined) {
  if (!a) return "—";
  const p = porcentaje(a.coinciden, a.comparados);
  return `${p === null ? "—" : `${p}%`} · ${a.lecturas} lectura${a.lecturas === 1 ? "" : "s"}`;
}

function TablaCampos({ campos, columnas, referencia }: { campos: CampoComparado[]; columnas: string[]; referencia: string }) {
  return (
    <div className="cmp-scroll">
      <table className="cmp-tabla">
        <thead>
          <tr>
            <th>Campo</th>
            <th>{nombreIa(referencia)} (referencia)</th>
            {columnas.map((id) => (
              <th key={id}>{nombreIa(id)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campos.map((c) => (
            <tr key={c.ruta}>
              <td className="cmp-ruta">{c.ruta}</td>
              <td className={c.referencia === undefined ? "falta" : undefined}>{fmtCampo(c.referencia)}</td>
              {columnas.map((id) => (
                <td key={id} className={!c.coinciden[id] ? "dif" : c.valores[id] === undefined ? "falta" : undefined}>
                  {fmtCampo(c.valores[id])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ComparacionIaPage({ searchParams }: { searchParams: Promise<{ endpoint?: string }> }) {
  const profile = await requireProfile();
  if (profile.rol !== "superusuario") {
    return <LockedPanel title="Solo para el Superusuario" description="La comparación entre IAs solo la ve el Superusuario." />;
  }

  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("ia_lectura").select("*").order("created_at", { ascending: false }).limit(100);
  const todas = (data ?? []) as IaLecturaRow[];
  const endpoints = [...new Set(todas.map((l) => l.endpoint))];
  const lecturas = sp.endpoint ? todas.filter((l) => l.endpoint === sp.endpoint) : todas;

  const comparadas = lecturas.map((l) => {
    const porIa = l.por_ia ?? {};
    const jsonPorIa = Object.fromEntries(Object.entries(porIa).map(([id, v]) => [id, v.json]));
    const comparacion: ComparacionLectura = compararLectura(jsonPorIa, l.resultado);
    // Con una sola IA y sin Claude, "lo votado" es esa misma IA: compararla contra sí misma daría 100% sin decir nada.
    const sinControl = comparacion.referencia === "resultado" && Object.keys(porIa).length < 2;
    return { l, comparacion, sinControl };
  });

  const vsClaude = new Map<string, Acum>();
  const vsVotado = new Map<string, Acum>();
  const fallas = new Map<string, number>();
  for (const { l, comparacion, sinControl } of comparadas) {
    if (!sinControl) {
      const destino = comparacion.referencia === "claude" ? vsClaude : vsVotado;
      for (const [id, r] of Object.entries(comparacion.porIa)) sumar(destino, id, r.comparados, r.coinciden);
    }
    for (const f of l.fallaron ?? []) {
      const id = f.split(":")[0];
      fallas.set(id, (fallas.get(id) ?? 0) + 1);
    }
  }
  const idsResumen = [...new Set([...vsClaude.keys(), ...vsVotado.keys(), ...fallas.keys()])].sort((a, b) => ordenIa(a) - ordenIa(b));

  return (
    <div>
      <div className="page-heading">
        <h1>Comparación de IAs</h1>
        <p>Qué leyó cada IA sobre la misma foto, para ver cuál acierta más y mejorar las instrucciones</p>
      </div>

      <div className="card">
        <div className="section-label">Coincidencia por IA (últimas {todas.length} lecturas)</div>
        <p className="hint" style={{ margin: "0 0 10px" }}>
          Con Claude prendida cada IA se mide contra lo que leyó Claude. Con Claude apagada se mide contra el resultado votado entre
          las que respondieron (solo cuenta si respondieron al menos dos). Un campo que una IA inventa de más o se saltea cuenta como
          diferencia.
        </p>
        {idsResumen.length === 0 ? (
          <p className="empty-note">Todavía no hay lecturas guardadas. Se van cargando solas cuando alguien usa una función de lectura con IA.</p>
        ) : (
          <div className="cmp-scroll">
            <table className="cmp-resumen">
              <thead>
                <tr>
                  <th>IA</th>
                  <th>Coincide con Claude</th>
                  <th>Coincide con lo votado</th>
                  <th>Fallas</th>
                </tr>
              </thead>
              <tbody>
                {idsResumen.map((id) => (
                  <tr key={id}>
                    <td>
                      {nombreIa(id)}
                      {id === "claude" && <span className="badge">referencia</span>}
                    </td>
                    <td>{id === "claude" ? "—" : celdaPorcentaje(vsClaude.get(id))}</td>
                    <td>{celdaPorcentaje(vsVotado.get(id))}</td>
                    <td>{fallas.get(id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Lecturas</div>
        {endpoints.length > 1 && (
          <p className="hint" style={{ margin: "0 0 10px" }}>
            Función:{" "}
            <Link href="/configuracion/ia/comparacion" style={{ fontWeight: sp.endpoint ? 400 : 700 }}>
              Todas
            </Link>
            {endpoints.map((e) => (
              <span key={e}>
                {" · "}
                <Link href={`/configuracion/ia/comparacion?endpoint=${encodeURIComponent(e)}`} style={{ fontWeight: sp.endpoint === e ? 700 : 400 }}>
                  {nombreFuncion(e)}
                </Link>
              </span>
            ))}
          </p>
        )}
        {comparadas.length === 0 && <p className="empty-note">No hay lecturas para mostrar.</p>}
        {comparadas.slice(0, 25).map(({ l, comparacion, sinControl }) => {
          const columnas = Object.keys(l.por_ia ?? {})
            .filter((id) => id !== comparacion.referencia)
            .sort((a, b) => ordenIa(a) - ordenIa(b));
          const conDif = comparacion.campos.filter((c) => columnas.some((id) => !c.coinciden[id]));
          const iguales = comparacion.campos.filter((c) => !columnas.some((id) => !c.coinciden[id]));
          return (
            <details className="cmp-lectura" key={l.id}>
              <summary>
                {fmtFecha(l.created_at)} · {nombreFuncion(l.endpoint)}
                {l.proveedores.length > 0 && <span className="venc-badge ok">{l.proveedores.map(nombreIa).join(" + ")}</span>}
                {l.dudosos.length > 0 && <span className="venc-badge warn">{l.dudosos.length} sin mayoría</span>}
                {l.fallaron.length > 0 && <span className="venc-badge danger">{l.fallaron.length} fallaron</span>}
              </summary>
              <div style={{ paddingTop: 8 }}>
                {l.fallaron.length > 0 && (
                  <p className="hint" style={{ margin: "0 0 8px" }}>
                    {l.fallaron.join(" · ")}
                  </p>
                )}
                {sinControl ? (
                  <p className="hint" style={{ margin: 0 }}>
                    Respondió una sola IA y Claude no participó: no hay con qué compararla. Lo que leyó:{" "}
                    <span className="cmp-ruta">{JSON.stringify(l.resultado)}</span>
                  </p>
                ) : (
                  <>
                    {l.dudosos.length > 0 && (
                      <p className="hint" style={{ margin: "0 0 8px" }}>
                        Sin mayoría en: <span className="cmp-ruta">{l.dudosos.join(", ")}</span>
                      </p>
                    )}
                    {conDif.length > 0 ? (
                      <TablaCampos campos={conDif} columnas={columnas} referencia={comparacion.referencia} />
                    ) : (
                      <p className="hint" style={{ margin: 0 }}>
                        Todas coinciden en todos los campos.
                      </p>
                    )}
                    {iguales.length > 0 && conDif.length > 0 && (
                      <details style={{ marginTop: 8 }}>
                        <summary className="hint" style={{ cursor: "pointer" }}>
                          Ver los {iguales.length} campos que coinciden
                        </summary>
                        <TablaCampos campos={iguales} columnas={columnas} referencia={comparacion.referencia} />
                      </details>
                    )}
                  </>
                )}
              </div>
            </details>
          );
        })}
        {comparadas.length > 25 && <p className="hint">Se muestran las 25 más recientes de {comparadas.length}.</p>}
      </div>
    </div>
  );
}
