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
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-3 py-2 sm:px-5 sm:py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            {title}
          </h2>
          {action}
        </header>
      )}
      {/* phone density (2026-09-19): 12px padding below 640px, the 20px desktop padding from sm up */}
      <div className="p-3 sm:p-5">{children}</div>
    </section>
  );
}
