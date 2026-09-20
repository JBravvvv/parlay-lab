import type { ReactNode } from "react";

/** Compact title/action row. Long page explanations are available on demand;
 * a supplied short status (e.g. board freshness) remains visible on every screen. */
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
  const heading = <h1 className="display text-[20px] leading-tight text-text sm:text-[24px]">{title}</h1>;
  const phoneSub = subMobile ?? sub;
  return (
    <div data-page-header className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-2" title={typeof eyebrow === "string" ? eyebrow : undefined}>
        {heading}{chip}
      </div>
      {action}
      {sub && <details className="page-description w-full text-[11px] leading-snug text-muted">
        <summary className="cursor-pointer font-semibold">About this page</summary>
        <div className="pt-1">{sub}</div>
      </details>}
      {subMobile && <div data-page-sub="phone" className="w-full text-[11px] font-semibold text-muted">{phoneSub}</div>}
    </div>
  );
}
