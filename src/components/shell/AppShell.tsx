"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion, type Transition } from "motion/react";
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
import { SportSwitch } from "./SportSwitch";
import { VideoBackdrop } from "./VideoBackdrop";
import { useLedgerSyncBeacon } from "@/lib/ledgerSync";
import { useCfbSyncBeacon } from "@/lib/cfb/sync";
import { SPORT_META, useSport } from "@/lib/sport";

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

/* INSTRUCTION 38 (2026-09-05): the active indicators are motion `layoutId` elements —
   the rail pill and the bottom-bar pill SLIDE to the new tab instead of repainting.
   A snappy spring with a touch of overshoot (the native-app feel); reduced motion
   swaps in an instant transition. */
const SLIDE: Transition = { type: "spring", stiffness: 430, damping: 34, mass: 0.9 };
const INSTANT: Transition = { duration: 0 };

function Brand() {
  return (
    <Link href="/" className="flex items-baseline gap-0.5 select-none">
      <span className="text-[14px] font-bold tracking-tight text-text md:text-[15px]">PARLAY</span>
      <span className="text-gradient text-[14px] font-bold md:text-[15px]">//</span>
      <span className="text-[14px] font-bold tracking-tight text-text md:text-[15px]">LAB</span>
    </Link>
  );
}

function RailLink({ item, pathname, transition }: { item: NavItem; pathname: string; transition: Transition }) {
  const { href, label, icon: Icon } = item;
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      className={`press relative flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-medium ${
        active ? "text-pos" : "text-muted hover:bg-white/[0.05] hover:text-text"
      }`}
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          initial={false}
          transition={transition}
          className="absolute inset-0 rounded-full bg-pos/10 shadow-[inset_0_0_0_1px_rgba(182,255,61,0.16),0_0_18px_-8px_rgba(182,255,61,0.55)]"
          aria-hidden
        />
      )}
      {active && (
        <motion.span
          layoutId="rail-bar"
          initial={false}
          transition={transition}
          className="absolute -left-2 top-[calc(50%-8px)] h-4 w-[3px] rounded-full bg-pos shadow-[0_0_10px_rgba(182,255,61,0.7)]"
          aria-hidden
        />
      )}
      <Icon className={`relative ${active ? "text-pos" : "text-faint"}`} />
      <span className="relative">{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sport = useSport();
  const reduced = useReducedMotion();
  // ledger cloud sync runs app-wide: on open, on refocus, and on a timer — one beacon
  // per desk (the CFB ledger is its own record on its own keys)
  useLedgerSyncBeacon();
  useCfbSyncBeacon();
  // "/" is the immersive landing: full-bleed hero with its own navbar — no
  // side rail, no mobile top bar, no content gutters. Bottom tabs stay (PWA nav).
  const landing = pathname === "/";
  const slide = reduced ? INSTANT : SLIDE;
  const cfb = sport === "cfb";

  return (
    <div className="min-h-dvh">
      {/* the looping video plays behind every page (mounted once — survives
          navigation); data pages get a dark scrim, the landing runs it raw */}
      <VideoBackdrop fixed scrim={!landing} />

      {/* desktop side rail — two groups: the work tabs under the brand, the
          bookkeeping/tools tabs pinned above the footer. The eyebrow and the
          rail glow follow the selected desk; the SportSwitch flips it. */}
      <aside
        className={`rail-glow ${cfb ? "is-cfb" : ""} fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col border-r border-white/[0.05] bg-surface/60 backdrop-blur-xl ${landing ? "" : "md:flex"}`}
      >
        <div className="relative px-4 py-4">
          <Brand />
          <div
            className={`mt-0.5 truncate text-[9.5px] font-semibold uppercase tracking-[0.2em] ${cfb ? "text-cfb/80" : "text-faint"}`}
          >
            {SPORT_META[sport].eyebrow}
          </div>
          <SportSwitch className="mt-3 w-full" />
        </div>
        <nav className="mt-2 flex flex-1 flex-col px-2">
          <div className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === "top").map((item) => (
              <RailLink key={item.href} item={item} pathname={pathname} transition={slide} />
            ))}
          </div>
          <div className="flex-1" aria-hidden />
          <div className="flex flex-col gap-0.5 border-t border-white/[0.05] pb-2 pt-2">
            {NAV.filter((n) => n.group === "bottom").map((item) => (
              <RailLink key={item.href} item={item} pathname={pathname} transition={slide} />
            ))}
          </div>
        </nav>
        <div className="border-t border-line px-4 py-3 text-[10px] text-faint">
          MLB & CFB · informational only, not betting advice
        </div>
      </aside>

      {/* mobile top bar — reserves the iOS status-bar inset (the app draws
          edge-to-edge under it); max() keeps the normal padding in browsers.
          One row at 375px: brand · SportSwitch · every route that is not a
          bottom tab as an icon, so all ten pages stay reachable on a phone. */}
      <header
        className={`sticky top-0 z-30 items-center justify-between gap-1.5 border-b border-white/[0.05] bg-bg/70 px-3 pb-2.5 backdrop-blur-xl md:hidden ${landing ? "hidden" : "flex"}`}
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.625rem)" }}
      >
        <Brand />
        <SportSwitch size="sm" className="shrink-0" />
        <div className="flex shrink-0 items-center gap-0.5">
          {NAV.filter((n) => !n.mobile).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              title={label}
              className={`press rounded-lg p-[5px] ${isActive(pathname, href) ? "text-pos" : "text-muted"}`}
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
          six-column grid was already wrapping the 7th tab onto a second row). The
          active tab carries a raised pill that slides between tabs. */}
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
              className={`press relative flex flex-col items-center gap-0.5 py-2 text-[9.5px] font-semibold ${
                active ? "text-pos" : "text-faint"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="tab-active"
                  initial={false}
                  transition={slide}
                  className="absolute left-[calc(50%-24px)] top-[3px] h-[30px] w-12 rounded-full bg-pos/15 shadow-[inset_0_0_0_1px_rgba(182,255,61,0.22),0_-6px_18px_-8px_rgba(182,255,61,0.6)]"
                  aria-hidden
                />
              )}
              <Icon className="relative" />
              <span className="relative">{mobileLabel ?? label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
