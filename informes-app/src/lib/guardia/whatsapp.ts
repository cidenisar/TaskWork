/**
 * Links wa.me para compartir novedades de Guardia General a mano — no hay
 * API ni número de empresa (ver HANDOFF §9), así que todo esto es abrir
 * WhatsApp con el texto ya armado y que la persona elija a quién mandarlo.
 * Un link wa.me nunca puede apuntar a un grupo, solo a un chat individual
 * o, sin teléfono, a la pantalla de "elegir chat" de WhatsApp.
 */

/** Abre WhatsApp con el texto listo y sin destinatario fijo — la persona elige el grupo o chat y manda. */
export function linkWhatsappGrupo(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** Abre WhatsApp directo al chat de esa persona, con el texto ya armado. */
export function linkWhatsappIndividual(telefono: string, texto: string): string {
  const limpio = telefono.replace(/\D/g, "");
  return `https://wa.me/${limpio}?text=${encodeURIComponent(texto)}`;
}
