"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IconBoard,
  IconBuilder,
  IconDash,
  IconDerby,
  IconLedger,
  IconSettings,
  IconSharp,
  IconSim,
  IconStats,
} from "./icons";
import { VideoBackdrop } from "./VideoBackdrop";

const NAV = [
  { href: "/", label: "Dashboard", icon: IconDash, mobile: true },
  { href: "/stats", label: "Stats", icon: IconStats, mobile: true },
  { href: "/board", label: "Board", icon: IconBoard, mobile: true },
  { href: "/derby", label: "HR Derby", icon: IconDerby, mobile: false },
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
      <span className="text-gradient text-[15px] font-bold">//</span>
      <span className="text-[15px] font-bold tracking-tight text-text">LAB</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // "/" is the immersive landing: full-bleed hero with its own navbar — no
  // side rail, no mobile top bar, no content gutters. Bottom tabs stay (PWA nav).
  const landing = pathname === "/";

  return (
    <div className="min-h-dvh">
      {/* the looping video plays behind every page (mounted once — survives
          navigation); data pages get a dark scrim, the landing runs it raw */}
      <VideoBackdrop fixed scrim={!landing} />

      {/* desktop side rail */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col border-r border-white/[0.05] bg-surface/60 backdrop-blur-xl ${landing ? "" : "md:flex"}`}>
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
                className={`flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-(--dur-fast) ${
                  active
                    ? "bg-pos/10 text-pos"
                    : "text-muted hover:bg-white/[0.05] hover:text-text"
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
      <header className={`sticky top-0 z-30 items-center justify-between border-b border-white/[0.05] bg-bg/70 px-4 py-3 backdrop-blur-xl md:hidden ${landing ? "hidden" : "flex"}`}>
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
      {landing ? (
        <main>{children}</main>
      ) : (
        <main className="px-4 pb-24 pt-4 md:ml-[200px] md:px-8 md:pb-10 md:pt-6">
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
      )}

      {/* mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-white/[0.05] bg-surface/70 backdrop-blur-xl md:hidden"
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
