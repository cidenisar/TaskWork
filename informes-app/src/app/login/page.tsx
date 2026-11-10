import { LoginForm } from "./login-form";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * El login es la única pantalla pública (sin sesión) — `config_general_select`
 * exige `auth.uid() is not null`, así que un anon-client no puede leer el
 * logo. Se lee server-side con Service Role, solo este valor no sensible
 * (la URL del logo ya es pública: se usa en PDFs y en <img> por toda la
 * app). Si falta la clave de servicio, se muestra el login igual, sin logo.
 */
async function obtenerLogoEmpresa(): Promise<string | null> {
  try {
    const service = createServiceRoleClient();
    const { data } = await service.from("config_general").select("logo_empresa_url").eq("id", 1).single();
    return data?.logo_empresa_url ?? null;
  } catch {
    return null;
  }
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const desactivado = params.desactivado === "1";
  const logoUrl = await obtenerLogoEmpresa();

  return (
    <div className="app">
      <div className="login-wrap">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- logo chico, no vale la pena next/image acá
          <img src={logoUrl} alt="" className="login-logo" />
        )}
        <span className="brand">TaskWork</span>
        <div className="login-sub">Ingresá para cargar o revisar informes y rendiciones</div>
        <LoginForm next={next} desactivado={desactivado} />
      </div>
    </div>
  );
}
