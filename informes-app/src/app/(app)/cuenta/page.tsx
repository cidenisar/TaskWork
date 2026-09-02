import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROL_LABEL } from "@/lib/types";
import { DatosPersonalesForm } from "@/components/cuenta/datos-personales-form";
import { DatosAdicionalesForm } from "@/components/cuenta/datos-adicionales-form";
import { CambiarClaveForm } from "@/components/cuenta/cambiar-clave-form";

export default async function CuentaPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: extra } = await supabase
    .from("profiles")
    .select(
      "dni, dni_vencimiento, fecha_nacimiento, factor_sanguineo, licencia_conducir_vencimiento, email_alternativo, contacto_emergencia_nombre, contacto_emergencia_telefono, talla_camisa, talla_pantalon, talla_remera, talla_campera, talla_mameluco, talla_botines",
    )
    .eq("id", profile.id)
    .single();

  return (
    <div>
      <div className="page-heading">
        <h1>Mi cuenta</h1>
        <p>
          {profile.email} · {ROL_LABEL[profile.rol]}
        </p>
      </div>
      <DatosPersonalesForm
        nombreCompleto={profile.nombreCompleto}
        telefono={profile.telefono}
        fotoPerfilUrl={profile.fotoPerfilUrl}
      />
      <DatosAdicionalesForm
        initial={{
          dni: extra?.dni ?? null,
          dniVencimiento: extra?.dni_vencimiento ?? null,
          fechaNacimiento: extra?.fecha_nacimiento ?? null,
          factorSanguineo: extra?.factor_sanguineo ?? null,
          licenciaConducirVencimiento: extra?.licencia_conducir_vencimiento ?? null,
          emailAlternativo: extra?.email_alternativo ?? null,
          contactoEmergenciaNombre: extra?.contacto_emergencia_nombre ?? null,
          contactoEmergenciaTelefono: extra?.contacto_emergencia_telefono ?? null,
          tallaCamisa: extra?.talla_camisa ?? null,
          tallaPantalon: extra?.talla_pantalon ?? null,
          tallaRemera: extra?.talla_remera ?? null,
          tallaCampera: extra?.talla_campera ?? null,
          tallaMameluco: extra?.talla_mameluco ?? null,
          tallaBotines: extra?.talla_botines ?? null,
        }}
      />
      <CambiarClaveForm />
    </div>
  );
}
