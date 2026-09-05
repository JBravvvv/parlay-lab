import type { ReactNode } from "react";

/**
 * Page titles are statements: display face, big, tight.
 *
 * INSTRUCTION 38 (2026-09-05): `eyebrow` (a small-caps line ABOVE the title — the desk,
 * e.g. "College Football") and `chip` (a tag BESIDE the title, e.g. the 🏈 CFB chip) are
 * optional; when neither is passed the markup is exactly what it was, so every existing
 * page renders unchanged.
 */
export function PageHeader({
  title,
  sub,
  action,
  eyebrow,
  chip,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  chip?: ReactNode;
}) {
  const heading = <h1 className="display text-(length:--text-display) text-text">{title}</h1>;
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted">{eyebrow}</div>
        )}
        {chip ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {heading}
            {chip}
          </div>
        ) : (
          heading
        )}
        {sub && <div className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">{sub}</div>}
      </div>
      {action}
    </div>
  );
}
