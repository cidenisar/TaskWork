export interface BarItem {
  label: string;
  value: number;
  displayValue: string;
}

export function BarList({ items }: { items: BarItem[] }) {
  if (items.length === 0) {
    return <div className="empty-note">Sin datos este mes todavía.</div>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div>
      {items.map((i) => (
        <div className="bar-row" key={i.label}>
          <div className="bar-label">{i.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(4, Math.round((i.value / max) * 100))}%` }} />
          </div>
          <div className="bar-val">{i.displayValue}</div>
        </div>
      ))}
    </div>
  );
}
