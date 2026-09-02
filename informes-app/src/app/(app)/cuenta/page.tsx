import { requireProfile } from "@/lib/auth";
import { ROL_LABEL } from "@/lib/types";
import { DatosPersonalesForm } from "@/components/cuenta/datos-personales-form";
import { CambiarClaveForm } from "@/components/cuenta/cambiar-clave-form";

export default async function CuentaPage() {
  const profile = await requireProfile();

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
      <CambiarClaveForm />
    </div>
  );
}
