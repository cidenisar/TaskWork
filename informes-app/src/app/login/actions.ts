"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/");

  if (!email || !password) {
    return { error: "Ingresá tu email y contraseña." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email o contraseña incorrectos." };
  }

  // Cuenta desactivada por un Administrador: la contraseña es correcta, pero
  // no la dejamos entrar — se corta la sesión que signInWithPassword recién
  // abrió y se avisa por qué (ver "Configuración → Usuarios y roles").
  const { data: profile } = await supabase.from("profiles").select("activo").eq("id", data.user.id).single();
  if (profile && !profile.activo) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta fue desactivada. Contactá a un Administrador." };
  }

  redirect(next.startsWith("/") ? next : "/");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
