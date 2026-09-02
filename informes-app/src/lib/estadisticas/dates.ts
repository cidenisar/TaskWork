export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function monthLabel(d: Date): string {
  return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}
export function inRange(fecha: string, desde: string, hastaExclusive: string): boolean {
  return fecha >= desde && fecha < hastaExclusive;
}
export function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
}
