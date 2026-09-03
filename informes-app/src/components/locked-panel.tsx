import { ModuleIcon } from "@/components/module-icon";

export function LockedPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="locked-panel">
      <div className="ico" style={{ display: "flex", justifyContent: "center" }}>
        <ModuleIcon name="lock" size={56} tone="muted" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
