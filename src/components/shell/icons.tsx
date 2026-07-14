/** Inline icon set — no icon library, keeps the bundle lean and the look ours. */

type P = { className?: string };
const base = "h-[20px] w-[20px]";

export function IconDash({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`${base} ${className}`}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
      <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5" />
    </svg>
  );
}
export function IconStats({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`${base} ${className}`}>
      <path d="M5 21V10" />
      <path d="M10.5 21V4" />
      <path d="M16 21v-8" />
      <path d="M21 21H3" />
    </svg>
  );
}
export function IconBoard({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`${base} ${className}`}>
      <path d="M3 17l5-5 4 3 6-7 3 3" />
      <path d="M3 21h18" />
    </svg>
  );
}
export function IconSharp({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`${base} ${className}`}>
      <path d="M12 3l2.4 5.3 5.6.6-4.2 3.9 1.2 5.7-5-2.9-5 2.9 1.2-5.7L4 8.9l5.6-.6z" />
    </svg>
  );
}
export function IconBuilder({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`${base} ${className}`}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="10" r="2.4" />
      <circle cx="9" cy="18" r="2.4" />
      <path d="M8 7.5l7.5 2M16.2 12l-5.4 4.6" />
    </svg>
  );
}
export function IconLedger({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`${base} ${className}`}>
      <path d="M5 3h14a1 1 0 011 1v16a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}
export function IconSim({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`${base} ${className}`}>
      <path d="M9 3h6M12 3v5" />
      <path d="M7 21h10a2 2 0 001.7-3L13 8H11L5.3 18A2 2 0 007 21z" />
      <path d="M8.5 15h7" />
    </svg>
  );
}
export function IconSettings({ className = "" }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={`${base} ${className}`}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.2a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.2a1.7 1.7 0 001 1.5h.1a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1h.2a2 2 0 110 4h-.2a1.7 1.7 0 00-1.5 1z" />
    </svg>
  );
}
