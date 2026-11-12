import { LoginForm } from "./login-form";

/**
 * Login con la imagen "C4 · Marca al costado" + logo monograma TW (elegidos
 * por Ivan el 11/11/2026). Fondo azul en los dos temas; la tarjeta del
 * formulario sigue el tema (blanca en claro, azul noche en oscuro). Las
 * animaciones están en `wireframe-ui.css` (bloque `.lg-*`) y se apagan con
 * "reducir movimiento".
 */
export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const desactivado = params.desactivado === "1";

  return (
    <main className="lg-screen">
      <svg className="lg-rings lg-rings-a" aria-hidden="true" viewBox="0 0 620 620" fill="none">
        <circle cx="310" cy="310" r="300" />
        <circle cx="310" cy="310" r="220" />
        <circle className="lg-ring-cta" cx="310" cy="310" r="140" />
      </svg>
      <svg className="lg-rings lg-rings-b" aria-hidden="true" viewBox="0 0 560 560" fill="none">
        <circle cx="280" cy="280" r="270" />
        <circle cx="280" cy="280" r="190" />
      </svg>

      <div className="lg-inner">
        <div className="lg-brand">
          <div className="lg-mark" aria-hidden="true">
            <span>TW</span>
          </div>
          <h1 className="lg-name">TaskWork</h1>
          <p className="lg-tag">
            Informes, gastos y relevamiento de equipos en una sola app. Ingresá para cargar o revisar tu trabajo.
          </p>
        </div>
        <div className="lg-card">
          <LoginForm next={next} desactivado={desactivado} />
        </div>
      </div>
    </main>
  );
}
