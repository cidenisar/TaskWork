/** Círculo girando — se usa en botones mientras la IA está procesando una foto (ver .spinner en wireframe-ui.css). */
export function Spinner({ size = 13 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}
