import { Icon } from "./icon";

/** Reemplaza los "⚠️ {mensaje}" repetidos por toda la app (wizards, formularios, login). */
export function ErrorNote({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="error-note" style={style}>
      <Icon name="warning" size={13} />
      {children}
    </div>
  );
}

/** Reemplaza los "✓ {mensaje}" / "✅ {mensaje}" repetidos por toda la app. */
export function SuccessNote({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="success-note" style={style}>
      <Icon name="check-circle" size={13} />
      {children}
    </div>
  );
}
