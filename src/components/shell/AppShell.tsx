"use client";

import { SportsbookSelector } from "@/components/sportsbook/SportsbookSelector";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import {
  IconBoard,
  IconBuilder,
  IconCalc,
  IconGames,
  IconLedger,
  IconMore,
  IconParlay,
  IconPark,
  IconSeason,
  IconSettings,
  IconSharp,
  IconSim,
  IconStats,
} from "./icons";
import { SportSwitch } from "./SportSwitch";
import { VideoBackdrop } from "./VideoBackdrop";
import { useLedgerSyncBeacon } from "@/lib/ledgerSync";
import { useCfbSyncBeacon } from "@/lib/cfb/sync";
import { useNflSyncBeacon } from "@/lib/nfl/sync";
import { SPORT_META, useSport } from "@/lib/sport";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** desktop side rail: "top" sits under the brand, "bottom" is pinned above the footer */
  group: "top" | "bottom";
  /** shows in the mobile bottom tab bar; everything else lands in the phone header — Settings as its own
   *  gear, the rest inside the ⋯ More menu (2026-09-19) */
  mobile: boolean;
  /** shorter label for the 9.5px bottom-bar type (six tabs at 375px) */
  mobileLabel?: string;
  /** the tab's accent (2026-09-05, Josh: "Add color to the Tab titles") — a hex, distinct
   *  per tab, pastel enough to read at 9.5px on the dark ground. Label + icon wear it
   *  (70% when idle, full when active) and the active pill/bar glow takes it too. */
  tone: `#${string}`;
  /** INSTRUCTION 46 fix round: a CFB-only page — the entry is hidden (rail + phone top bar) while the
   *  SportSwitch sits on MLB, so the MLB desk never shows a tab whose page ignores it. */
  cfbOnly?: boolean;
  /** INSTRUCTION 68 (2026-09-17): an MLB-only page — hidden while the SportSwitch sits on CFB or NFL. */
  mlbOnly?: boolean;
};

/** `#RRGGBB` → `rgba(r, g, b, a)` — the tone at a given opacity (idle text, pill fill, glow) */
function tint(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Order is Josh's, verbatim (2026-09-03): "Games, Stats, Board, Builder, Parlay Builder,
// Parlay Calculator (formerly Calc) on Top Left & Ledger, The Sharp, Simulator, Settings
// on Bottom Left." Dashboard is gone — the brand logo already links "/".
// 2026-09-04, Josh: "Move the Ledger tab back up right below Parlay Calc (Rename it from Parlay Calculator)"
// 2026-09-05, Josh: "'The Sharp' & 'Simulator' tabs can go back up right above Parlay Builder"
// + "'Ledger' tab can be moved down to bottom of page right above Settings"
// + "Add color to the Tab titles (ie: Board, The Sharp, Simulator, etc)" — the `tone` column.
const NAV: readonly NavItem[] = [
  { href: "/games", label: "Games", icon: IconGames, group: "top", mobile: true, tone: "#7DD3FC" },
  { href: "/stats", label: "Stats", icon: IconStats, group: "top", mobile: true, tone: "#C4B5FD" },
  { href: "/board", label: "Board", icon: IconBoard, group: "top", mobile: true, tone: "#A5B4FC" },
  { href: "/builder", label: "Builder", icon: IconBuilder, group: "top", mobile: true, tone: "#FCD34D" },
  { href: "/sharp", label: "The Sharp", icon: IconSharp, group: "top", mobile: false, tone: "#FDA4AF" },
  { href: "/simulator", label: "Simulator", icon: IconSim, group: "top", mobile: false, tone: "#67E8F9" },
  { href: "/props", label: "Parlay Builder", icon: IconParlay, group: "top", mobile: true, mobileLabel: "Parlays", tone: "#FDBA74" },
  { href: "/calc", label: "Parlay Calc", icon: IconCalc, group: "top", mobile: false, tone: "#5EEAD4" },
  // INSTRUCTION 46 (2026-09-08): Season Lab — season-long CFB props / win totals / parlays on typed lines. Desktop rail + the
  // phone's top-bar icon row (a 7th bottom tab does not fit at 375px); the tone is the CFB amber (--color-cfb) since the page is CFB-only.
  { href: "/season", label: "Season Lab", icon: IconSeason, group: "top", mobile: false, tone: "#F5A524", cfbOnly: true },
  // INSTRUCTION 68 (2026-09-17, Josh: "a tab titled 'Ballpark Factor' that shows daily ballpark factor for every stadium") — MLB-only,
  // desktop rail + the phone's top-bar icon row (its fifth icon on the MLB desk, the width Season Lab already proved on CFB).
  { href: "/ballpark", label: "Ballpark Factor", icon: IconPark, group: "top", mobile: false, tone: "#F9A8D4", mlbOnly: true },
  { href: "/ledger", label: "Ledger", icon: IconLedger, group: "bottom", mobile: true, tone: "#FDE68A" },
  { href: "/settings", label: "Settings", icon: IconSettings, group: "bottom", mobile: false, tone: "#D4D4D8" },
];

/** the phone header's ⋯ More menu: every route that is neither a bottom tab nor Settings (Settings keeps its own
 *  gear beside the menu). Derived from the table, so a new page can never fall off the phone. 2026-09-19, Josh:
 *  "the 4 icons other than settings in top right of header need to be a dropdown or added as a 'more' selection tab". */
const MORE = NAV.filter((n) => !n.mobile && n.href !== "/settings");
const SETTINGS = NAV.find((n) => n.href === "/settings")!;

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
    // the wordmark goes to the Games desk, never the landing (Josh, 2026-09-18: "Clicking Parlay Lab logo in top left brings up this page for some reason … It should never bring this up")
    <Link replace href="/games" className="flex items-baseline gap-0.5 select-none">
      <span className="text-[14px] font-bold tracking-tight text-text md:text-[15px]">PARLAY</span>
      <span className="text-gradient text-[14px] font-bold md:text-[15px]">//</span>
      <span className="text-[14px] font-bold tracking-tight text-text md:text-[15px]">LAB</span>
    </Link>
  );
}

/* Tone opacities: idle label/icon sit at 70% / 55% of the tab's tone; the active
   state is the full tone, and the pill fill, its inset ring and the glow are the
   same hue at low alpha — so each tab lights up in its own colour, never always the brand cerulean. */
const IDLE_LABEL = 0.7;
const IDLE_ICON = 0.55;

function RailLink({ item, pathname, transition }: { item: NavItem; pathname: string; transition: Transition }) {
  const { href, label, icon: Icon, tone } = item;
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      replace
      className={`press group relative flex items-center gap-2.5 rounded-full px-3.5 py-2 text-[13px] font-medium ${
        active ? "" : "hover:bg-white/[0.05]"
      }`}
      style={{ "--tone": tone } as CSSProperties}
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          initial={false}
          transition={transition}
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: tint(tone, 0.1),
            boxShadow: `inset 0 0 0 1px ${tint(tone, 0.16)}, 0 0 18px -8px ${tint(tone, 0.55)}`,
          }}
          aria-hidden
        />
      )}
      {active && (
        <motion.span
          layoutId="rail-bar"
          initial={false}
          transition={transition}
          className="absolute -left-2 top-[calc(50%-8px)] h-4 w-[3px] rounded-full"
          style={{ backgroundColor: tone, boxShadow: `0 0 10px ${tint(tone, 0.7)}` }}
          aria-hidden
        />
      )}
      {/* desktop hover brightens the idle icon + label to the full tone (a CSS var, so the class can win over the inline idle colour) */}
      <span className="relative flex group-hover:[color:var(--tone)]!" style={{ color: active ? tone : tint(tone, IDLE_ICON) }}>
        <Icon />
      </span>
      <span className="relative group-hover:[color:var(--tone)]!" style={{ color: active ? tone : tint(tone, IDLE_LABEL) }}>
        {label}
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sport = useSport();
  const reduced = useReducedMotion();
  // ledger cloud sync runs app-wide: on open, on refocus, and on a timer — one beacon
  // per desk (the CFB and NFL ledgers are their own records on their own keys)
  useLedgerSyncBeacon();
  useCfbSyncBeacon();
  useNflSyncBeacon();
  // "/" is the immersive landing: full-bleed hero with its own navbar — no
  // side rail, no mobile top bar, no content gutters. Bottom tabs stay (PWA nav).
  const landing = pathname === "/";
  const slide = reduced ? INSTANT : SLIDE;
  // the phone header's ⋯ menu — closes on every navigation (the pathname flips) and on a tap outside
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  // PORTRAIT LOCK (2026-09-19, Josh: "It should be stuck in portrait mode at all times"). Where the browser
  // honours it (Android Chrome, installed) this pins the home-screen app upright; iOS has no lock API and
  // ignores the manifest's orientation, so there the .rotate-lock sheet in globals.css covers a sideways phone.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(display-mode: standalone)").matches) return;
    const o = window.screen?.orientation as unknown as { lock?: (t: string) => Promise<void> } | undefined;
    o?.lock?.("portrait")?.catch(() => {});
  }, []);
  const cfb = sport === "cfb";
  const nfl = sport === "nfl";
  /** the entries this desk shows — CFB-only pages (Season Lab) drop out while the switch is on MLB or NFL
   *  (NFL Season Lab is cut for the 2026-09-08 ship; the NFL desk adds no nav entry of its own) */
  const shown = (n: Pick<NavItem, "cfbOnly" | "mlbOnly">) => (!n.cfbOnly || cfb) && (!n.mlbOnly || sport === "mlb");
  /** the ⋯ button wears the tone of whichever More page is open, so the header still shows where you are */
  const moreTone = MORE.find((n) => isActive(pathname, n.href))?.tone;

  return (
    <div className="min-h-dvh">
      {/* the looping video plays behind every page (mounted once — survives
          navigation); data pages get a dark scrim, the landing runs it raw */}
      <VideoBackdrop fixed scrim={!landing} />

      {/* portrait lock, the iOS half: shown by globals.css only in the installed app, sideways, at phone heights */}
      <div className="rotate-lock fixed inset-0 z-[100] flex-col items-center justify-center gap-2 bg-bg px-8 text-center" role="status" aria-live="polite">
        <span aria-hidden className="text-[32px] leading-none">📱</span>
        <p className="text-[15px] font-semibold text-text">Parlay Lab runs in portrait</p>
        <p className="text-[12.5px] text-muted">Turn your phone back upright to keep going.</p>
      </div>

      {/* desktop side rail — two groups: the work tabs under the brand, the
          bookkeeping/tools tabs pinned above the footer. The eyebrow and the
          rail glow follow the selected desk; the SportSwitch flips it. */}
      <aside
        className={`rail-glow ${cfb ? "is-cfb" : nfl ? "is-nfl" : ""} fixed inset-y-0 left-0 z-30 hidden w-[200px] flex-col border-r border-white/[0.05] bg-surface/60 backdrop-blur-xl ${landing ? "" : "md:flex"}`}
      >
        <div className="relative px-4 py-4">
          <Brand />
          <div
            className={`mt-0.5 truncate text-[9.5px] font-semibold uppercase tracking-[0.2em] ${cfb ? "text-cfb/80" : nfl ? "text-nfl/80" : "text-faint"}`}
          >
            {SPORT_META[sport].eyebrow}
          </div>
          <SportSwitch className="mt-3 w-full" />
        </div>
        <nav className="mt-2 flex flex-1 flex-col px-2">
          <div className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === "top").map((item) =>
              shown(item) ? <RailLink key={item.href} item={item} pathname={pathname} transition={slide} /> : null,
            )}
          </div>
          <div className="flex-1" aria-hidden />
          <div className="flex flex-col gap-0.5 border-t border-white/[0.05] pb-2 pt-2">
            {NAV.filter((n) => n.group === "bottom").map((item) => (
              <RailLink key={item.href} item={item} pathname={pathname} transition={slide} />
            ))}
          </div>
        </nav>
        <div className="border-t border-line px-4 py-3 text-[10px] text-faint">
          MLB, CFB & NFL · informational only, not betting advice
        </div>
      </aside>

      {/* mobile top bar — reserves the iOS status-bar inset (the app draws
          edge-to-edge under it); max() keeps the normal padding in browsers.
          One row at 375px: brand · SportSwitch · the ⋯ More menu · the Settings gear.
          2026-09-19 (Josh: "The top header fades away; the 4 icons other than settings in top right of
          header need to be a dropdown"): the icon row (five 26px glyphs on CFB, 370px measured) became one
          ⋯ button whose popover lists those pages by name, and the bar's ground went from 70% to 92% so
          it reads as a bar over scrolling content instead of dissolving into it. The popover is absolute,
          so the header keeps its measured height (useShellInsets reads header.sticky). */}
      <header
        className={`sticky top-0 z-30 items-center justify-between gap-1.5 border-b border-white/[0.06] bg-bg/92 px-3 pb-2 backdrop-blur-xl md:hidden ${landing ? "hidden" : "flex"}`}
        style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
      >
        <Brand />
        <SportSwitch size="sm" className="shrink-0" />
        <div className="relative flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label="More pages"
            aria-haspopup="menu"
            aria-expanded={more}
            aria-controls="shell-more-menu"
            onClick={() => setMore((v) => !v)}
            className={`press rounded-lg p-[3px] ${more ? "bg-white/[0.08] text-text" : "text-muted"}`}
            style={moreTone ? { color: moreTone } : undefined}
          >
            <IconMore />
          </button>
          <Link
            href={SETTINGS.href}
            replace
            aria-label={SETTINGS.label}
            title={SETTINGS.label}
            className="press rounded-lg p-[3px]"
            style={{ color: isActive(pathname, SETTINGS.href) ? SETTINGS.tone : tint(SETTINGS.tone, IDLE_LABEL) }}
          >
            <IconSettings />
          </Link>
          {more && (
            <>
              {/* tap-away backdrop: a full-screen button under the popover, over the page */}
              <button type="button" aria-label="Close menu" onClick={() => setMore(false)} className="fixed inset-0 z-30 cursor-default bg-black/35" />
              <div
                id="shell-more-menu"
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-40 min-w-[196px] overflow-hidden rounded-2xl border border-white/10 bg-surface/95 p-1.5 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl"
              >
                {MORE.map(({ href, label, icon: Icon, tone, cfbOnly, mlbOnly }) =>
                  shown({ cfbOnly, mlbOnly }) ? (
                    <Link
                      key={href}
                      href={href}
                      replace
                      role="menuitem"
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium active:bg-white/[0.06]"
                      style={{ color: isActive(pathname, href) ? tone : tint(tone, IDLE_LABEL) }}
                    >
                      <Icon />
                      {label}
                    </Link>
                  ) : null,
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* content */}
      {landing ? (
        <main>{children}</main>
      ) : (
        <main className="px-4 pb-24 pt-4 md:ml-[200px] md:px-8 md:pb-10 md:pt-6">
          <div className="mx-auto w-full max-w-[1280px]"><SportsbookSelector />{children}</div>
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
        {NAV.filter((n) => n.mobile).map(({ href, label, mobileLabel, icon: Icon, tone }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              replace
              aria-label={label}
              className="press relative flex flex-col items-center gap-0.5 py-2 text-[9.5px] font-semibold"
              style={{ color: active ? tone : tint(tone, IDLE_LABEL) }}
            >
              {active && (
                <motion.span
                  layoutId="tab-active"
                  initial={false}
                  transition={slide}
                  className="absolute left-[calc(50%-24px)] top-[3px] h-[30px] w-12 rounded-full"
                  style={{
                    backgroundColor: tint(tone, 0.15),
                    boxShadow: `inset 0 0 0 1px ${tint(tone, 0.22)}, 0 -6px 18px -8px ${tint(tone, 0.6)}`,
                  }}
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
