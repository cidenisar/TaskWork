import { Fragment } from "react";
import { Icon } from "@/components/icon";

export interface WizardStep {
  title: string;
  sub: string;
}

export function Stepper({ steps, current }: { steps: WizardStep[]; current: number }) {
  return (
    <>
      <div className="stepper">
        {steps.map((_, i) => {
          const n = i + 1;
          return (
            <Fragment key={n}>
              <div className={`step-node${n < current ? " done" : n === current ? " active" : ""}`}>
                {n < current ? <Icon name="check" size={13} /> : n}
              </div>
              {n < steps.length && <div className={`step-line${n < current ? " filled" : ""}`} />}
            </Fragment>
          );
        })}
      </div>
      <div className="step-heading">
        <div className="num">
          PASO {current} DE {steps.length}
        </div>
        <h1>{steps[current - 1].title}</h1>
        <p>{steps[current - 1].sub}</p>
      </div>
    </>
  );
}
