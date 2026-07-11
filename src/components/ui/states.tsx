import type { ReactNode } from "react";

/** Fixed-size shimmer block; compose these into page-shaped skeletons. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Rows-of-a-table skeleton with zero layout shift. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="text-[13px] font-semibold text-text">{title}</div>
      {body && <div className="max-w-sm text-[12px] leading-relaxed text-muted">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something broke",
  body,
  onRetry,
}: {
  title?: string;
  body?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-(--radius-panel) border border-neg/30 bg-neg/5 py-10 text-center">
      <div className="text-[13px] font-semibold text-neg">{title}</div>
      {body && <div className="max-w-sm text-[12px] leading-relaxed text-muted">{body}</div>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-(--radius-chip) border border-line-2 bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-text hover:border-line-2 hover:bg-surface-3"
        >
          Retry
        </button>
      )}
    </div>
  );
}
