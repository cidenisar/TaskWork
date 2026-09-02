export function LockedPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="locked-panel">
      <div className="ico">🔒</div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
