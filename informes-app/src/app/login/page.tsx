import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return (
    <div className="app">
      <div className="login-wrap">
        <span className="brand">Informes</span>
        <div className="login-sub">Ingresá para cargar o revisar informes y rendiciones</div>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
