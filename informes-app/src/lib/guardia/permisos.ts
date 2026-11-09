/**
 * Reglas de autorización de Guardia General — HANDOFF-guardia-general.md §4.
 * Puras y sin DB: cada server action las llama con lo que acaba de leer de
 * `profiles`/`guardia_persona` EN ESE PEDIDO (nunca con algo que vino del
 * cliente o de un token viejo — "el rol se verifica en cada pedido, en el
 * servidor", HANDOFF §4 y §12.1). Esconder un botón no protege nada: esto
 * es lo único que de verdad lo hace, junto con las policies RLS que
 * reflejan las mismas reglas en la base.
 *
 * "Guardia general" y "técnico de guardia" NO son roles de `profiles.rol`
 * (ahí ambos son `tecnico`) — son el `area` de `guardia_persona`. Quién
 * puede CORREGIR, cerrar período, editar parámetros y gestionar
 * cronograma/personas/feriados es siempre la oficina: admin + supervisor +
 * superusuario (decisión de Ivan, 9/11: amplía la propuesta original del
 * HANDOFF de "solo admin" para cerrar período/parámetros a también
 * supervisor, igual que el resto de "oficina").
 */

import type { Rol } from "@/lib/types";
import type { AreaGuardia } from "./cronograma";

/** La persona de guardia (general o técnica) tiene esta área en `guardia_persona` — null si no hace guardia ("Sin guardia") o no es técnico. */
export interface ContextoGuardia {
  rol: Rol;
  area: AreaGuardia | null;
}

/** Admin, supervisor o superusuario — la "oficina" del HANDOFF. Mismo criterio que `is_admin_or_supervisor()` en SQL. */
export function esOficina(rol: Rol): boolean {
  return rol === "admin" || rol === "supervisor" || rol === "superusuario";
}

/** Solo quien tiene el área "General" puede registrar la llamada, activar guardias técnicas y cerrar el evento. */
export function esGuardiaGeneral(ctx: ContextoGuardia): boolean {
  return ctx.rol === "tecnico" && ctx.area === "General";
}

/** Cualquier técnico de guardia (general o de un área técnica) — alguien que SÍ hace guardia. */
export function esDeGuardia(ctx: ContextoGuardia): boolean {
  return ctx.rol === "tecnico" && ctx.area !== null;
}

export function puedeRegistrarLlamada(ctx: ContextoGuardia): boolean {
  return esGuardiaGeneral(ctx);
}

export function puedeActivarGuardiaTecnica(ctx: ContextoGuardia): boolean {
  return esGuardiaGeneral(ctx);
}

export function puedeCerrarEvento(ctx: ContextoGuardia): boolean {
  return esGuardiaGeneral(ctx);
}

/** Marcar/quitar feriado desde el celu ("hoy es feriado") — la guardia general, o la oficina desde el Panel/Parámetros. */
export function puedeMarcarFeriadoDesdeElCelu(ctx: ContextoGuardia): boolean {
  return esGuardiaGeneral(ctx) || esOficina(ctx.rol);
}

/** Agregar una novedad a un evento — cualquiera de sus participantes, o la guardia general del evento. La fila (es participante) se valida en el server action, no acá. */
export function puedeAgregarNovedad(ctx: ContextoGuardia, esParticipanteOGuardiaGeneral: boolean): boolean {
  return esDeGuardia(ctx) && esParticipanteOGuardiaGeneral;
}

/** Corregir SIEMPRE es solo oficina — horas de una participación, hora de la llamada, cronograma, cambios, feriados, personas (HANDOFF §4, confirmado). */
export function puedeCorregir(rol: Rol): boolean {
  return esOficina(rol);
}

/** Cerrar período de liquidación — admin + supervisor (decisión de Ivan, 9/11; amplía la propuesta "solo admin"). */
export function puedeCerrarPeriodo(rol: Rol): boolean {
  return esOficina(rol);
}

/** Editar parámetros del negocio — admin + supervisor (misma decisión). */
export function puedeEditarParametros(rol: Rol): boolean {
  return esOficina(rol);
}

export function puedeGestionarCronograma(rol: Rol): boolean {
  return esOficina(rol);
}

export function puedeGestionarPersonasDeGuardia(rol: Rol): boolean {
  return esOficina(rol);
}

export function puedeGestionarCambiosDeGuardia(rol: Rol): boolean {
  return esOficina(rol);
}

export function puedeAnularCambioDeGuardia(rol: Rol): boolean {
  return esOficina(rol);
}

/** Ve TODOS los eventos (no solo los propios) y las horas de cualquiera. */
export function puedeVerTodosLosEventos(rol: Rol): boolean {
  return esOficina(rol);
}
