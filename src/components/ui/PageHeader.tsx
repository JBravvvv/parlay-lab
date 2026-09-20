import type { ReactNode } from "react";

/**
 * Page titles are statements: display face, big, tight.
 *
 * INSTRUCTION 38 (2026-09-05): `eyebrow` (a small-caps line ABOVE the title — the desk,
 * e.g. "College Football") and `chip` (a tag BESIDE the title, e.g. the 🏈 CFB chip) are
 * optional; when neither is passed the markup is exactly what it was, so every existing
 * page renders unchanged.
 *
 * PHONE (2026-09-19, Josh: "Everything is so cluttered and takes up so much space you cant even
 * get to the picks"): below 640px the title drops to 22px, the action sits beside it on the same
 * row, and the sub is one clamped line under both (`subMobile` swaps in a shorter sentence). From
 * sm up the header is the desktop shape — tightened on 2026-09-19 (desktop density): the display size
 * caps at 36px (globals.css --text-display), mb-4 under it, the sub one 4px step below the title.
 */
export function PageHeader({
  title,
  sub,
  subMobile,
  action,
  eyebrow,
  chip,
}: {
  title: string;
  sub?: ReactNode;
  /** a shorter sub for the phone row; falls back to `sub` */
  subMobile?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
  chip?: ReactNode;
}) {
  const heading = <h1 className="display text-[22px] leading-none text-text sm:text-(length:--text-display)">{title}</h1>;
  const phoneSub = subMobile ?? sub;
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5 sm:mb-4 sm:gap-3">
      <div className="min-w-0 flex-1 sm:flex-none">
        {eyebrow && (
          <div className="mb-1 hidden text-[10px] font-bold uppercase tracking-[0.22em] text-muted sm:mb-1.5 sm:block">{eyebrow}</div>
        )}
        {chip ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {heading}
            {chip}
          </div>
        ) : (
          heading
        )}
        {sub && <div className="mt-1 hidden max-w-xl text-[13px] leading-relaxed text-muted sm:block">{sub}</div>}
      </div>
      {action}
      {phoneSub && (
        <div data-page-sub="phone" className="line-clamp-1 w-full text-[11px] leading-snug text-muted sm:hidden">
          {phoneSub}
        </div>
      )}
    </div>
  );
}
