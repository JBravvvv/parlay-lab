"use client";

import { useEffect, useRef, useState } from "react";
import { Pill } from "@/components/ui/Pill";

/**
 * Share / copy (INSTRUCTION 40, 2026-09-05): copies the ticket summary as plain text —
 * the clipboard only, no external call, no share sheet. Flashes "Copied" for 1.6s.
 * Falls back to a temporary textarea + execCommand when the async clipboard API is
 * unavailable (older WebViews); if that fails too, says so instead of pretending.
 */
export function ShareButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  const flash = (s: "copied" | "failed") => {
    setState(s);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  };

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        flash("copied");
        return;
      }
    } catch {
      /* fall through to the textarea path */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      flash(ok ? "copied" : "failed");
    } catch {
      flash("failed");
    }
  };

  return (
    <Pill
      variant="gold"
      type="button"
      onClick={copy}
      disabled={disabled}
      aria-live="polite"
      className="h-[44px] px-5 text-[13px]"
    >
      {state === "copied" ? "✓ Copied" : state === "failed" ? "Couldn't copy" : "Copy ticket"}
    </Pill>
  );
}
