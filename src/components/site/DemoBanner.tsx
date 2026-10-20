export function DemoBanner({ mode }: { mode: "demo" | "live" }) {
  if (mode !== "demo") return null;
  return (
    <div className="border-b border-ink/15 bg-accent-soft text-ink">
      <p className="mx-auto max-w-6xl px-4 py-1.5 text-center text-[13px] font-semibold leading-snug">
        Демонстрационный барбершоп. Мастера, цены и записи вымышлены — визит не состоится.
      </p>
    </div>
  );
}
