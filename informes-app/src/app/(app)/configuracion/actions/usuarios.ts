"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import { ROL_LABEL, type Rol } from "@/lib/types";
import type { ConfigActionResult } from "./empresa";

export interface CrearUsuarioResult extends ConfigActionResult {
  credenciales?: { email: string; password: string };
}

function generarPassword(): string {
  // 12 caracteres alfanuméricos, suficiente para una contraseña temporal que el
  // usuario cambia después — nunca se persiste en texto plano, solo se muestra
  // una vez en la respuesta de esta action.
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return out;
}

export async function crearUsuarioAction(
  email: string,
  nombreCompleto: string,
  rol: Rol,
): Promise<CrearUsuarioResult> {
  const profile = await requireAdmin();
  const correo = email.trim().toLowerCase();
  const nombre = nombreCompleto.trim();
  if (!correo || !nombre) return { success: false, error: "Completá el nombre y el email." };

  const password = generarPassword();
  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
    user_metadata: { nombre_completo: nombre },
  });
  if (error || !data.user) {
    const mensaje = error?.message ?? "No se pudo crear el usuario.";
    return {
      success: false,
      error: mensaje.toLowerCase().includes("already been registered")
        ? "Ya existe una cuenta con ese email."
        : mensaje,
    };
  }

  // El trigger handle_new_user ya creó el profile en rol 'tecnico'; si se pidió
  // otro rol, lo subimos ahora con la sesión normal del admin (misma policy
  // "profiles_update_admin" que usa el resto de Configuración).
  const supabase = await createClient();
  if (rol !== "tecnico") {
    const { error: rolError } = await supabase.from("profiles").update({ rol }).eq("id", data.user.id);
    if (rolError) {
      return { success: false, error: `Usuario creado, pero no se pudo asignar el rol: ${rolError.message}` };
    }
  }

  await logAudit(supabase, profile, `Creó el usuario "${nombre}" (${correo}) con rol ${ROL_LABEL[rol]}`);
  revalidatePath("/configuracion");
  return { success: true, credenciales: { email: correo, password } };
}

export async function cambiarRolAction(
  userId: string,
  nombre: string,
  nuevoRol: Rol,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  if (userId === profile.id) {
    return { success: false, error: "No podés cambiar tu propio rol." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ rol: nuevoRol }).eq("id", userId);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Cambió el rol de "${nombre}" a ${ROL_LABEL[nuevoRol]}`);
  revalidatePath("/configuracion");
  return { success: true };
}
