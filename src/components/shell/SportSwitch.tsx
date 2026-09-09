"use client";

import { Segmented, type SegmentedOption } from "@/components/ui/Segmented";
import { SPORTS, SPORT_META, setSport, useSport, type Sport } from "@/lib/sport";

/**
 * THE SPORT SWITCH (INSTRUCTION 38, 2026-09-05): "MLB" / "CFB" / "NFL" (NFL joined 2026-09-08) — the app-wide desk
 * selector every page reads through `useSport()`. It rides the desktop rail under the
 * brand and the mobile header between the brand and the tool icons, so the desk can be
 * flipped from anywhere and the thumb colour (lime / amber / blue) says which desk is open.
 *
 * Purely a `Segmented` over `SPORTS`: the motion layoutId thumb, the `--ease-press` snap
 * and the `.press` tap feel all come from the primitive.
 */
/* 2026-09-08 (three desks): LABEL-ONLY at both sizes — "MLB / CFB / NFL", no emoji. Measured with
   Geist: the phone header's dense `sm` switch is 101px label-only vs 161px with emoji, and the CFB
   desk's row (brand 95px + five 26px tool icons 138px + gaps and gutter 36px) leaves 106px, so only
   the label-only switch fits every desk at 375px. The desktop rail is w-[200px] px-4 = 168px of
   content and `.segmented` is an inline-grid of 1fr tracks that cannot shrink below each pill's
   min-content: three md emoji pills (68.7 / 67.0 / 65.8px) overflow to 208px and spill past the
   rail, while three md label-only pills (51.3px each, 164px) fit — so the rail drops the emoji too.
   CFB/NFL share the football glyph anyway; the thumb colour (lime / amber / blue) says which desk. */
const OPTIONS: readonly SegmentedOption<Sport>[] = SPORTS.map((s) => ({
  key: s,
  label: SPORT_META[s].short,
  title: `${SPORT_META[s].label} desk`,
}));

export function SportSwitch({ size = "md", className = "" }: { size?: "sm" | "md"; className?: string }) {
  const sport = useSport();
  return (
    <Segmented
      label="Sport"
      options={OPTIONS}
      value={sport}
      onChange={setSport}
      size={size}
      dense={size === "sm"}
      tone={sport === "cfb" ? "cfb" : sport === "nfl" ? "nfl" : "pos"}
      className={className}
    />
  );
}
