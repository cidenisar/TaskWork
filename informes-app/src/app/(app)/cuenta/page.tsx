import { requireProfile } from "@/lib/auth";
import { ROL_LABEL } from "@/lib/types";
import { CambiarClaveForm } from "@/components/cuenta/cambiar-clave-form";

export default async function CuentaPage() {
  const profile = await requireProfile();

  return (
    <div>
      <div className="page-heading">
        <h1>Mi cuenta</h1>
        <p>
          {profile.nombreCompleto} · {profile.email} · {ROL_LABEL[profile.rol]}
        </p>
      </div>
      <CambiarClaveForm />
    </div>
  );
}
