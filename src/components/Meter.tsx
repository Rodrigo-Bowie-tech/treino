interface MeterProps {
  value: number;
  max: number;
  label: string;
  slim?: boolean;
}

export function Meter({ value, max, label, slim }: MeterProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div
      className={`meter${slim ? ' slim' : ''}${over ? ' over' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
