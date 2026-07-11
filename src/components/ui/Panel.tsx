import type { ReactNode } from "react";

/**
 * The basic surface: glassy, generously rounded, hairline border, floating
 * over the glowing background. Elevation via light, not drop shadow.
 */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
