"use client";

import { Segmented, type SegmentedOption } from "@/components/ui/Segmented";
import { SPORTS, SPORT_META, setSport, useSport, type Sport } from "@/lib/sport";

/**
 * THE SPORT SWITCH (INSTRUCTION 38, 2026-09-05): "⚾ MLB" / "🏈 CFB" — the app-wide desk
 * selector every page reads through `useSport()`. It rides the desktop rail under the
 * brand and the mobile header between the brand and the tool icons, so the desk can be
 * flipped from anywhere and the thumb colour (lime / amber) says which desk is open.
 *
 * Purely a `Segmented` over `SPORTS`: the motion layoutId thumb, the `--ease-press` snap
 * and the `.press` tap feel all come from the primitive.
 */
const OPTIONS: readonly SegmentedOption<Sport>[] = SPORTS.map((s) => ({
  key: s,
  label: SPORT_META[s].short,
  icon: <span aria-hidden>{SPORT_META[s].emoji}</span>,
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
      tone={sport === "cfb" ? "cfb" : "pos"}
      className={className}
    />
  );
}
