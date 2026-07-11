"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconBoard,
  IconBuilder,
  IconDash,
  IconLedger,
  IconSettings,
  IconSharp,
  IconSim,
} from "./icons";

const NAV = [
  { href: "/", label: "Dashboard", icon: IconDash, mobile: true },
  { href: "/board", label: "Board", icon: IconBoard, mobile: true },
  { href: "/sharp", label: "The Sharp", icon: IconSharp, mobile: true },
  { href: "/builder", label: "Builder", icon: IconBuilder, mobile: true },
  { href: "/ledger", label: "Ledger", icon: IconLedger, mobile: true },
  { href: "/simulator", label: "Simulator", icon: IconSim, mobile: false },
  { href: "/settings", label: "Settings", icon: IconSettings, mobile: false },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Brand() {
  return (
    <Link href="/" className="flex items-baseline gap-0.5 select-none">
      <span className="text-[15px] font-bold tracking-tight text-text">PARLAY</span>
      <span className="text-[15px] font-bold text-pos">//</span>
      <span className="text-[15px] font-bold tracking-tight text-text">LAB</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh">
      {/* desktop side rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col border-r border-line bg-surface md:flex">
        <div className="px-4 py-4">
          <Brand />
          <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-faint">
            Betting terminal
          </div>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-pos/10 text-pos"
                    : "text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <Icon className={active ? "text-pos" : "text-faint"} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[10px] text-faint">
          MLB · informational only, not betting advice
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <Link
            href="/simulator"
            aria-label="Simulator"
            className={`rounded-lg p-2 ${isActive(pathname, "/simulator") ? "text-pos" : "text-muted"}`}
          >
            <IconSim />
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className={`rounded-lg p-2 ${isActive(pathname, "/settings") ? "text-pos" : "text-muted"}`}
          >
            <IconSettings />
          </Link>
        </div>
      </header>

      {/* content */}
      <main className="px-4 pb-24 pt-4 md:ml-[200px] md:px-8 md:pb-10 md:pt-6">
        <div className="mx-auto w-full max-w-[1280px]">{children}</div>
      </main>

      {/* mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.filter((n) => n.mobile).map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[9.5px] font-semibold ${
                active ? "text-pos" : "text-faint"
              }`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
