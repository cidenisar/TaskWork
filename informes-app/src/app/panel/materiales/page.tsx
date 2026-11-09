import { BuscarMateriales } from "@/components/materiales/buscar-materiales";

export default function PanelMaterialesPage() {
  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Buscar material</h1>
          <p>
            Rastreá un equipo (por N° de serie, etiqueta YPF) o un material a granel del remito (cañería, bulonería, cable) — dónde se
            instaló y en qué informe quedó registrado.
          </p>
        </div>
      </div>
      <BuscarMateriales />
    </div>
  );
}
