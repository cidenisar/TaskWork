import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Devuelve el perfil (con rol) del usuario autenticado, o null si no hay sesión.
 * El rol siempre se lee de la tabla `profiles`, nunca del cliente — así la UI
 * y las Server Actions confían en la misma fuente que hace cumplir RLS.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, nombre_completo, rol, telefono, foto_perfil_url, activo")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    nombreCompleto: profile.nombre_completo,
    rol: profile.rol,
    telefono: profile.telefono,
    fotoPerfilUrl: profile.foto_perfil_url,
    activo: profile.activo,
  };
}

/**
 * Como getCurrentProfile, pero redirige a /login si no hay sesión.
 *
 * También corta acá la sesión de una cuenta desactivada por un Administrador
 * mientras el usuario la seguía teniendo abierta en el navegador (el bloqueo
 * "normal" pasa antes, en loginAction, pero un JWT ya emitido sigue siendo
 * válido hasta que expira — sin este chequeo, alguien desactivado podría
 * seguir usando la app hasta que el token venza solo).
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.activo) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login?desactivado=1");
  }
  return profile;
}

/** Redirige a "/" si el usuario no es Administrador (defensa en profundidad además de RLS). */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  return profile;
}
