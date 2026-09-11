import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Recibe errores reportados desde el cliente (ver src/lib/client-error-report.ts
 * y src/components/client-error-reporter.tsx) y los guarda para que un
 * Administrador los vea en Configuración → Errores del dispositivo — así
 * un error que solo pasa en otro celular/navegador queda registrado en vez
 * de perderse.
 *
 * Nunca debe cortarle el flujo al usuario: si algo sale mal acá adentro, se
 * responde igual con ok:false en vez de tirar una excepción sin manejar.
 */
export async function POST(req: NextRequest) {
  let body: { mensaje?: unknown; stack?: unknown; contexto?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const mensaje = typeof body.mensaje === "string" ? body.mensaje.trim().slice(0, 2000) : "";
  if (!mensaje) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let usuarioNombre: string | null = null;
    let usuarioEmail: string | null = null;
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("nombre_completo, email").eq("id", user.id).single();
      usuarioNombre = profile?.nombre_completo ?? null;
      usuarioEmail = profile?.email ?? null;
    }

    await supabase.from("client_errores").insert({
      user_id: user?.id ?? null,
      usuario_nombre: usuarioNombre,
      usuario_email: usuarioEmail,
      contexto: typeof body.contexto === "string" ? body.contexto.slice(0, 200) : null,
      mensaje,
      stack: typeof body.stack === "string" ? body.stack.slice(0, 4000) : null,
      url: typeof body.url === "string" ? body.url.slice(0, 500) : null,
      user_agent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
