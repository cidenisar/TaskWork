import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevaControlVehiculoForm } from "@/components/control-vehiculo/nueva-control-form";

export default async function NuevoControlVehiculoPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: vehiculos } = await supabase.from("catalogo_vehiculos").select("id, patente, marca_modelo").order("patente");

  return (
    <div>
      <div className="page-heading">
        <h1>Control de Vehículo</h1>
        <p>Fotos de todo el vehículo, kilometraje actual y chequeo de matafuego/botiquín — como en el alta.</p>
      </div>
      <NuevaControlVehiculoForm
        vehiculos={(vehiculos ?? []).map((v) => ({ id: v.id, patente: v.patente, marcaModelo: v.marca_modelo }))}
      />
    </div>
  );
}
