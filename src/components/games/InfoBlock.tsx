/**
 * A titled list of the feed's own "label: value" strings — the BATTING /
 * BASERUNNING / FIELDING notes under a batting box, and the game info block.
 * Renders exactly what statsapi provides; nothing is added or reworded.
 */
export function InfoBlock({ title, items, notes }: { title: string; items: { label: string; value: string }[]; notes?: { label: string; value: string }[] }) {
  if (!items.length && !notes?.length) return null;
  return (
    <section className="border-t border-white/[0.06] px-4 py-3">
      <h3 className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">{title}</h3>
      <dl className="space-y-1 text-[11.5px] leading-snug">
        {notes?.map((n) => (
          <div key={`n-${n.label}`} className="text-muted">
            <span className="text-faint">{n.label}-</span>
            {n.value}
          </div>
        ))}
        {items.map((i) => (
          <div key={i.label} className="text-muted">
            <dt className="inline font-semibold text-text">{i.label}: </dt>
            <dd className="num inline">{i.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
