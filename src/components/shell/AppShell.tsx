"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import {
  IconBoard,
  IconBuilder,
  IconCalc,
  IconGames,
  IconLedger,
  IconParlay,
  IconSettings,
  IconSharp,
  IconSim,
  IconStats,
} from "./icons";
import { VideoBackdrop } from "./VideoBackdrop";
import { useLedgerSyncBeacon } from "@/lib/ledgerSync";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** desktop side rail: "top" sits under the brand, "bottom" is pinned above the footer */
  group: "top" | "bottom";
  /** shows in the mobile bottom tab bar; everything else lands in the mobile top-bar icon row */
  mobile: boolean;
  /** shorter label for the 9.5px bottom-bar type (six tabs at 375px) */
  mobileLabel?: string;
};

// Order is Josh's, verbatim (2026-09-03): "Games, Stats, Board, Builder, Parlay Builder,
// Parlay Calculator (formerly Calc) on Top Left & Ledger, The Sharp, Simulator, Settings
// on Bottom Left." Dashboard is gone — the brand logo already links "/".
const NAV: readonly NavItem[] = [
  { href: "/games", label: "Games", icon: IconGames, group: "top", mobile: true },
  { href: "/stats", label: "Stats", icon: IconStats, group: "top", mobile: true },
  { href: "/board", label: "Board", icon: IconBoard, group: "top", mobile: true },
  { href: "/builder", label: "Builder", icon: IconBuilder, group: "top", mobile: true },
  { href: "/props", label: "Parlay Builder", icon: IconParlay, group: "top", mobile: true, mobileLabel: "Parlays" },
  { href: "/calc", label: "Parlay Calc", icon: IconCalc, group: "top", mobile: false },
  // 2026-09-04, Josh: "Move the Ledger tab back up right below Parlay Calc (Rename it from Parlay Calculator)"
  { href: "/ledger", label: "Ledger", icon: IconLedger, group: "top", mobile: true },
  { href: "/sharp", label: "The Sharp", icon: IconSharp, group: "bottom", mobile: false },
  { href: "/simulator", label: "Simulator", icon: IconSim, group: "bottom", mobile: false },
  { href: "/settings", label: "Settings", icon: IconSettings, group: "bottom", mobile: false },
];

// "/" is the landing and is never a rail entry, so it is never highlighted.
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

function RailLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, icon: Icon } = item;
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-(--dur-fast) ${
        active ? "bg-pos/10 text-pos" : "text-muted hover:bg-white/[0.05] hover:text-text"
      }`}
    >
      <Icon className={active ? "text-pos" : "text-faint"} />
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // ledger cloud sync runs app-wide: on open, on refocus, and on a timer
  useLedgerSyncBeacon();
  // "/" is the immersive landing: full-bleed hero with its own navbar — no
  // side rail, no mobile top bar, no content gutters. Bottom tabs stay (PWA nav).
  const landing = pathname === "/";

  return (
    <div className="min-h-dvh">
      {/* the looping video plays behind every page (mounted once — survives
          navigation); data pages get a dark scrim, the landing runs it raw */}
      <VideoBackdrop fixed scrim={!landing} />

      {/* desktop side rail — two groups: the work tabs under the brand, the
          bookkeeping/tools tabs pinned above the footer */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col border-r border-white/[0.05] bg-surface/60 backdrop-blur-xl ${landing ? "" : "md:flex"}`}>
        <div className="px-4 py-4">
          <Brand />
          <div className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-faint">
            Betting terminal
          </div>
        </div>
        <nav className="mt-2 flex flex-1 flex-col px-2">
          <div className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === "top").map((item) => (
              <RailLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
          <div className="flex-1" aria-hidden />
          <div className="flex flex-col gap-0.5 border-t border-white/[0.05] pb-2 pt-2">
            {NAV.filter((n) => n.group === "bottom").map((item) => (
              <RailLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </nav>
        <div className="border-t border-line px-4 py-3 text-[10px] text-faint">
          MLB · informational only, not betting advice
        </div>
      </aside>

      {/* mobile top bar — reserves the iOS status-bar inset (the app draws
          edge-to-edge under it); max() keeps the normal padding in browsers.
          Every route that is not a bottom tab gets an icon here, so all ten
          pages stay reachable on a phone. */}
      <header
        className={`sticky top-0 z-30 items-center justify-between border-b border-white/[0.05] bg-bg/70 px-4 pb-3 backdrop-blur-xl md:hidden ${landing ? "hidden" : "flex"}`}
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
      >
        <Brand />
        <div className="flex items-center gap-0.5">
          {NAV.filter((n) => !n.mobile).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              className={`rounded-lg p-2 ${isActive(pathname, href) ? "text-pos" : "text-muted"}`}
            >
              <Icon />
            </Link>
          ))}
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

      {/* mobile bottom tab bar — columns computed from the mobile entries (a hardcoded
          grid-cols-6 was already wrapping the 7th tab onto a second row) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-white/[0.05] bg-surface/70 backdrop-blur-xl md:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          gridTemplateColumns: `repeat(${NAV.filter((n) => n.mobile).length}, minmax(0, 1fr))`,
        }}
      >
        {NAV.filter((n) => n.mobile).map(({ href, label, mobileLabel, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={`flex flex-col items-center gap-0.5 py-2 text-[9.5px] font-semibold ${
                active ? "text-pos" : "text-faint"
              }`}
            >
              <Icon />
              {mobileLabel ?? label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
