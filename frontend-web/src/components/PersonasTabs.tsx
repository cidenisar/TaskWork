// Tira de pestañas de "Administración de Padrón de Personas" — ver
// Cowork. En el wireframe las 4 pestañas viven en una sola pantalla
// (estado en memoria); acá, siguiendo el patrón ya establecido de una
// ruta propia por pantalla, son 4 rutas separadas con esta misma tira
// arriba para que se sientan como una sola sección. Desvío deliberado:
// el wireframe muestra el contador de las 4 pestañas a la vez (todo el
// dato ya estaba en memoria); acá solo se muestra el contador de la
// pestaña activa — mostrarlo en las otras 3 pediría cargarlas todas de
// antemano solo para un número.
import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/personas/padron", label: "Padrón" },
  { to: "/personas/pendientes", label: "Pendientes de aprobación" },
  { to: "/personas/importar", label: "Importar" },
  { to: "/personas/codigos", label: "Códigos de acceso" },
];

export function PersonasTabs({ count }: { count?: number }) {
  return (
    <div className="tabs">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => "tab-btn" + (isActive ? " on" : "")}>
          {({ isActive }) => (
            <>
              {t.label}
              {isActive && count !== undefined && <span className="tab-count">{count}</span>}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
