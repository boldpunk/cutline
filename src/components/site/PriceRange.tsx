import { formatDuration, formatUzs } from "@/lib/domain/money";

/** Exact price, or an explicit range labelled as depending on the barber — never a bare "от …". */
export function PriceRange({ min, max, className = "" }: { min: number; max: number; className?: string }) {
  if (min === max) return <span className={className}>{formatUzs(min)}</span>;
  return (
    <span className={className}>
      {formatUzs(min)} – {formatUzs(max)}
      <span className="block text-xs font-normal text-muted-text">зависит от мастера</span>
    </span>
  );
}

export function DurationRange({ min, max }: { min: number; max: number }) {
  return <>{min === max ? formatDuration(min) : `${formatDuration(min)} – ${formatDuration(max)}`}</>;
}
