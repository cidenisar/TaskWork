import { requireProfile } from "@/lib/auth";
import { LockedPanel } from "@/components/locked-panel";
import { createClient } from "@/lib/supabase/server";
import { PROVEEDORES_IA, proveedorConfigurado, obtenerConfigIa } from "@/lib/ai/motor";
import { InterruptoresIaCard, type FilaHistorialIa } from "@/components/config/interruptores-ia";

export default async function ConfiguracionIaPage() {
  const profile = await requireProfile();
  if (profile.rol !== "superusuario") {
    return <LockedPanel title="Solo para el Superusuario" description="Qué IAs usa la app solo lo puede cambiar el Superusuario." />;
  }

  const supabase = await createClient();
  const [config, { data: hist }] = await Promise.all([
    obtenerConfigIa(supabase),
    supabase.from("config_ia_hist").select("id, campo, valor_antes, valor_despues, quien, cuando").order("cuando", { ascending: false }).limit(30),
  ]);

  const ids = [...new Set((hist ?? []).map((h) => h.quien).filter((x): x is string => !!x))];
  const { data: perfiles } = ids.length
    ? await supabase.from("profiles").select("id, nombre_completo").in("id", ids)
    : { data: [] as { id: string; nombre_completo: string }[] };
  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo]));

  const historial: FilaHistorialIa[] = (hist ?? []).map((h) => ({
    id: h.id,
    campo: h.campo,
    antes: h.valor_antes,
    despues: h.valor_despues,
    quien: h.quien ? (nombre.get(h.quien) ?? "—") : "—",
    cuando: h.cuando,
  }));

  return (
    <div>
      <div className="page-heading">
        <h1>IA</h1>
        <p>Qué inteligencias artificiales usa la app para leer fotos y cómo se combinan</p>
      </div>
      <InterruptoresIaCard
        proveedores={PROVEEDORES_IA.map((p) => ({ id: p.id, nombre: p.nombre, gratis: p.gratis, configurado: proveedorConfigurado(p.id) }))}
        activos={config.activos}
        modo={config.modo}
        historial={historial}
      />
    </div>
  );
}
