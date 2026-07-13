"use client";

import { useEffect, useRef } from "react";

const SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_065045_c44942da-53c6-4804-b734-f9e07fc22e08.mp4";

/* The footage is purple; the brand is green. A hue rotation recolors the
   ribbons to emerald/teal in the compositor — no re-encode needed. */
const GREEN_SHIFT = "hue-rotate(-120deg) saturate(0.95)";

/**
 * Looping background video with a JS-controlled fade loop:
 * starts at opacity 0, fades in over the first 0.5s, fades out over the last
 * 0.5s (rAF-driven), and on `ended` resets to 0, waits 100ms, replays from 0.
 *
 * Playback is deliberately stubborn: iOS (Low Power Mode, PWA relaunches,
 * bfcache restores) often rejects the first play() — so we retry on canplay,
 * on visibility/pageshow, and on the first touch. If nothing ever starts,
 * it stays invisible and the ambient background carries the page.
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
    // React does NOT render the `muted` attribute into server HTML — it only
    // sets the property after hydration. Browsers that made their autoplay
    // decision from the parsed HTML saw an UNMUTED video and vetoed it, which
    // is why playback was intermittent. Set it imperatively before any play().
    v.muted = true;
    v.defaultMuted = true;

    let raf = 0;
    let replay: ReturnType<typeof setTimeout> | null = null;
    let stillSeeked = false;
    const mountedAt = performance.now();

    const kick = () => {
      if (v.paused && !v.ended) v.play().catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") kick();
    };
    const onFirstTouch = () => {
      kick();
      window.removeEventListener("pointerdown", onFirstTouch);
      window.removeEventListener("touchstart", onFirstTouch);
    };

    const tick = () => {
      const d = v.duration;
      if (isFinite(d) && d > 0 && !v.ended && v.readyState >= 2) {
        if (!v.paused) {
          const t = v.currentTime;
          const o = t < 0.5 ? t / 0.5 : d - t < 0.5 ? Math.max(0, (d - t) / 0.5) : 1;
          v.style.opacity = o.toFixed(3);
        } else if (performance.now() - mountedAt > 1500) {
          // Autoplay stayed vetoed: show a rich still frame instead of a
          // blank page (a tap or the retry timer starts motion from here).
          if (!stillSeeked && v.currentTime < 0.1) {
            stillSeeked = true;
            try { v.currentTime = d / 2; } catch { /* seek denied — keep frame 0 */ }
          }
          v.style.opacity = "1";
        }
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
    v.addEventListener("canplay", kick);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", kick);
    window.addEventListener("pointerdown", onFirstTouch);
    window.addEventListener("touchstart", onFirstTouch, { passive: true });
    kick();
    const retry = setInterval(kick, 4000); // transient stalls / late policy grants
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(retry);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("canplay", kick);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", kick);
      window.removeEventListener("pointerdown", onFirstTouch);
      window.removeEventListener("touchstart", onFirstTouch);
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
      loop={false}
      preload="auto"
      aria-hidden
      className="absolute inset-0 h-full w-full object-cover"
      style={{ opacity: 0, filter: GREEN_SHIFT, WebkitFilter: GREEN_SHIFT }}
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
