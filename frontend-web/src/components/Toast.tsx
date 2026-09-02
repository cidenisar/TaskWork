export function Toast({ mensaje }: { mensaje: string | null }) {
  return <div className={mensaje ? "toast show" : "toast"}>{mensaje}</div>;
}
