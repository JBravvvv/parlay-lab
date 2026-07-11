import type { ReactNode } from "react";

/** Page titles are statements: display face, big, tight. */
export function PageHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="display text-(length:--text-display) text-text">{title}</h1>
        {sub && <div className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted">{sub}</div>}
      </div>
      {action}
    </div>
  );
}
