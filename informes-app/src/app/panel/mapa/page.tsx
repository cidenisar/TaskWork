import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPanelOverview } from "@/lib/panel/overview";
import { MapaRelevamientosCard } from "@/components/panel/mapa-relevamientos-card";
import type { PuntoMapaRelevamiento } from "@/components/panel/mapa-relevamientos-inner";
import { getPuntosMapa } from "@/lib/panel/mapa";

/**
 * Mismo mapa que el de Vista General (comparten MapaRelevamientosCard), pero
 * en su propia pantalla y a la altura disponible completa — Vista General lo
 * muestra chico porque es un resumen entre otras cards; acá es lo único que
 * hay, así que ocupa todo el alto que el layout del Panel le deja.
 */
export default async function PanelMapaPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [overview, puntosCrudos] = await Promise.all([
    getPanelOverview(supabase, profile.rol !== "tecnico"),
    getPuntosMapa(supabase),
  ]);

  const sitioPorId = new Map(overview.sitios.map((s) => [s.id, s]));
  const puntosMapa: PuntoMapaRelevamiento[] = puntosCrudos.flatMap((p) => {
    const sitio = sitioPorId.get(p.ubicacionId);
    if (!sitio) return [];
    return [{ ...p, nombreSitio: sitio.nombreFino, urgencia: sitio.masUrgente?.urgencia ?? null }];
  });

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Mapa</h1>
          <p>Todos los sitios con GPS cargado, de un vistazo</p>
        </div>
      </div>
      <MapaRelevamientosCard
        puntos={puntosMapa}
        totalSitios={overview.kpis.totalSitios}
        height="max(420px, calc(100vh - 220px))"
        style={{ marginTop: 0 }}
      />
    </div>
  );
}
