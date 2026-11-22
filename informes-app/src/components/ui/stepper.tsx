import { Icon } from "@/components/icon";

export interface WizardStep {
  title: string;
  sub: string;
}

/**
 * Avance del asistente con la imagen "Mezcla" (10/11/2026): banda azul con
 * el nombre del paso, "Paso N de M" y una barra por paso. Los pasos hechos
 * van llenos en naranja, el actual se va llenando (animación de entrada) y
 * los que faltan quedan vacíos. Debajo de cada barra, el nombre corto del
 * paso, con un tilde que se dibuja en los ya terminados.
 */
export function Stepper({ steps, current }: { steps: WizardStep[]; current: number }) {
  const paso = steps[current - 1];
  return (
    <div className="mz-steps" role="group" aria-label={`Paso ${current} de ${steps.length}: ${paso.title}`}>
      <div className="mz-steps-head">
        <h1>{paso.title}</h1>
        <span className="mz-steps-count">
          Paso {current} de {steps.length}
        </span>
      </div>
      <div className="mz-steps-bars" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const n = i + 1;
          const estado = n < current ? "done" : n === current ? "active" : "";
          return (
            <div key={n} className={`mz-step ${estado}`}>
              <div className="mz-step-bar">
                <div className="mz-step-fill" />
              </div>
              <div className="mz-step-label">
                {n < current && <Icon name="check" size={12} className="mz-dibuja" />}
                <span>{s.title}</span>
              </div>
            </div>
          );
        })}
      </div>
      {paso.sub && <p className="mz-steps-sub">{paso.sub}</p>}
    </div>
  );
}
