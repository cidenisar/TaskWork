// Panel lateral genérico (scrim + slide-in) — mismo mecanismo que usa
// Cowork en varios wireframes de administración (Operadores, y
// probablemente Personal/Padrón, Sitios, Consolas más adelante).
import type { ReactNode } from "react";

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <>
      <div className={open ? "scrim show" : "scrim"} onClick={onClose} />
      <div className={open ? "drawer show" : "drawer"}>
        {open && (
          <>
            <div className="drawer-head">
              <h2>{title}</h2>
              <button className="drawer-close" type="button" onClick={onClose} aria-label="Cerrar">
                ×
              </button>
            </div>
            <div className="drawer-body">{children}</div>
            <div className="drawer-foot">{footer}</div>
          </>
        )}
      </div>
    </>
  );
}
