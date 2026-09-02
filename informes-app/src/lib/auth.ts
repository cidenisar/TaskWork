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
    .select("id, email, nombre_completo, rol, telefono, foto_perfil_url")
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
  };
}

/** Como getCurrentProfile, pero redirige a /login si no hay sesión. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/** Redirige a "/" si el usuario no es Administrador (defensa en profundidad además de RLS). */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.rol !== "admin") redirect("/");
  return profile;
}
