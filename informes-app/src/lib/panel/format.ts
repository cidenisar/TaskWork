/** "hace 3 días"/"hoy" — usado en Vista General para mostrar la última visita a un sitio o zona. */
export function fmtVisitaRelativa(fechaIso: string): string {
  const dias = Math.floor((Date.now() - new Date(`${fechaIso}T00:00:00`).getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "hace 1 día";
  return `hace ${dias} días`;
}
