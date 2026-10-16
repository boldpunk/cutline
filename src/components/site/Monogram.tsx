/** Placeholder for a barber without an approved photo: initials, never a stock face. */
export function Monogram({ name, className = "" }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center bg-surface text-accent display select-none ${className}`}
      style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 22px, rgb(217 240 90 / 0.07) 22px 24px)" }}
    >
      <span className="text-[min(9rem,40cqw)] leading-none">{initials}</span>
    </div>
  );
}
