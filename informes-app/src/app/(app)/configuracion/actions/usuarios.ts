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
  torre: string,
): Promise<CrearUsuarioResult> {
  const profile = await requireAdmin();
  const correo = email.trim().toLowerCase();
  const nombre = nombreCompleto.trim();
  const torreValue = torre.trim() || null;
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

  // El trigger handle_new_user ya creó el profile en rol 'tecnico'; el rol (si
  // se pidió otro) y la torre se completan ahora con la sesión normal del
  // admin (misma policy "profiles_update_admin" que usa el resto de
  // Configuración). Este es también el "alta" del catálogo de técnicos — ya
  // no existe una carga manual aparte: el técnico que ve el wizard de
  // Informe Técnico / Rendición de Gastos es exactamente la lista de
  // usuarios registrados acá.
  const supabase = await createClient();
  if (torreValue) {
    await supabase.from("catalogo_torres").upsert({ nombre: torreValue }, { onConflict: "nombre", ignoreDuplicates: true });
  }
  if (rol !== "tecnico" || torreValue) {
    const { error: updError } = await supabase
      .from("profiles")
      .update({ rol, torre: torreValue })
      .eq("id", data.user.id);
    if (updError) {
      return { success: false, error: `Usuario creado, pero no se pudo terminar de configurar: ${updError.message}` };
    }
  }

  await logAudit(supabase, profile, `Creó el usuario "${nombre}" (${correo}) con rol ${ROL_LABEL[rol]}`);
  revalidatePath("/configuracion");
  revalidatePath("/informe-tecnico/nuevo");
  revalidatePath("/rendicion-gastos/nueva");
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

export async function cambiarTorreAction(userId: string, nombre: string, torre: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const torreValue = torre.trim() || null;

  const supabase = await createClient();
  if (torreValue) {
    await supabase.from("catalogo_torres").upsert({ nombre: torreValue }, { onConflict: "nombre", ignoreDuplicates: true });
  }
  const { error } = await supabase.from("profiles").update({ torre: torreValue }).eq("id", userId);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Cambió la torre de "${nombre}" a ${torreValue || "sin torre"}`);
  revalidatePath("/configuracion");
  revalidatePath("/informe-tecnico/nuevo");
  revalidatePath("/rendicion-gastos/nueva");
  return { success: true };
}

/**
 * Cambia nombre y/o email de otro usuario. El email hay que cambiarlo en dos
 * lugares: en auth.users (con la Service Role Key, es el email con el que
 * inicia sesión) y en profiles.email (no hay trigger que los mantenga
 * sincronizados fuera del alta inicial) — si el email no cambió, se omite ese
 * paso.
 */
export async function editarUsuarioAction(
  userId: string,
  nombreCompleto: string,
  email: string,
): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const nombre = nombreCompleto.trim();
  const correo = email.trim().toLowerCase();
  if (!nombre || !correo) return { success: false, error: "Completá el nombre y el email." };

  const supabase = await createClient();
  const { data: actual } = await supabase.from("profiles").select("email").eq("id", userId).single();
  if (!actual) return { success: false, error: "No se encontró el usuario." };

  if (correo !== actual.email) {
    const admin = createServiceRoleClient();
    const { error: authError } = await admin.auth.admin.updateUserById(userId, { email: correo, email_confirm: true });
    if (authError) {
      const mensaje = authError.message ?? "No se pudo actualizar el email de acceso.";
      return {
        success: false,
        error: mensaje.toLowerCase().includes("already been registered") ? "Ya existe otra cuenta con ese email." : mensaje,
      };
    }
  }

  const { error } = await supabase.from("profiles").update({ nombre_completo: nombre, email: correo }).eq("id", userId);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Editó los datos de "${nombre}" (${correo})`);
  revalidatePath("/configuracion");
  revalidatePath("/informe-tecnico/nuevo");
  revalidatePath("/rendicion-gastos/nueva");
  return { success: true };
}

export interface BlanquearPasswordResult extends ConfigActionResult {
  password?: string;
}

/** Genera una contraseña temporal nueva y la fuerza en auth.users — el usuario la usa para volver a entrar. */
export async function blanquearPasswordAction(userId: string, nombre: string): Promise<BlanquearPasswordResult> {
  const profile = await requireAdmin();
  const password = generarPassword();

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { success: false, error: error.message ?? "No se pudo blanquear la contraseña." };

  const supabase = await createClient();
  await logAudit(supabase, profile, `Blanqueó la contraseña de "${nombre}"`);
  return { success: true, password };
}

/** Bloquea el login de un usuario sin borrar nada — su historial de informes/rendiciones queda intacto (ver migración profiles_activo). */
export async function desactivarUsuarioAction(userId: string, nombre: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  if (userId === profile.id) {
    return { success: false, error: "No podés desactivar tu propia cuenta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ activo: false }).eq("id", userId);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Desactivó al usuario "${nombre}"`);
  revalidatePath("/configuracion");
  revalidatePath("/informe-tecnico/nuevo");
  revalidatePath("/rendicion-gastos/nueva");
  return { success: true };
}

export async function reactivarUsuarioAction(userId: string, nombre: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ activo: true }).eq("id", userId);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, `Reactivó al usuario "${nombre}"`);
  revalidatePath("/configuracion");
  revalidatePath("/informe-tecnico/nuevo");
  revalidatePath("/rendicion-gastos/nueva");
  return { success: true };
}
