"use client";

import { useEffect, useRef } from "react";

const SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4";

/**
 * Looping background video with a JS-controlled fade loop:
 * starts at opacity 0, fades in over the first 0.5s, fades out over the last
 * 0.5s (rAF-driven), and on `ended` resets to 0, waits 100ms, replays from 0.
 * If autoplay is blocked or the network is down, it simply stays invisible
 * and the ambient background carries the page.
 *
 * `fixed` pins it behind the whole app (mounted once in AppShell, so it never
 * restarts on navigation); `scrim` lays a translucent dark wash over it for
 * the data-dense pages — the landing hero runs unscrimmed with its blur shape.
 */
export function VideoBackdrop({ fixed = false, scrim = false }: { fixed?: boolean; scrim?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let raf = 0;
    let replay: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const d = v.duration;
      if (isFinite(d) && d > 0 && !v.ended && !v.paused) {
        const t = v.currentTime;
        const o = t < 0.5 ? t / 0.5 : d - t < 0.5 ? Math.max(0, (d - t) / 0.5) : 1;
        v.style.opacity = o.toFixed(3);
      }
      raf = requestAnimationFrame(tick);
    };

    const onEnded = () => {
      v.style.opacity = "0";
      replay = setTimeout(() => {
        v.currentTime = 0;
        v.play().catch(() => {});
      }, 100);
    };

    v.addEventListener("ended", onEnded);
    v.play().catch(() => {});
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("ended", onEnded);
      if (replay) clearTimeout(replay);
    };
  }, []);

  const video = (
    <video
      ref={ref}
      src={SRC}
      muted
      playsInline
      autoPlay
      preload="auto"
      aria-hidden
      className="absolute inset-0 h-full w-full object-cover"
      style={{ opacity: 0 }}
    />
  );

  if (!fixed) return video;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {video}
      {scrim && <div className="absolute inset-0 bg-bg/40" />}
    </div>
  );
}
