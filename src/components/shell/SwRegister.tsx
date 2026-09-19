"use client";

import { useEffect } from "react";

/** the commit this bundle was built from — inlined at build time (next.config.ts `env`); "" on a local build */
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";
const CHECK_EVERY_MS = 20_000;
const RELOADED_KEY = "pl_reloaded_for";
let lastCheck = 0;

/** JOSH (2026-09-19): "it doesn't seem like you resized ANYTHING on the iOS add to home screen version i have on my
    phone" — prod was serving the new build; the INSTALLED app was still showing the page it had loaded before the
    deploy. iOS keeps a home-screen app's page alive in memory for days, there is no address bar to reload from, and
    the service worker is network-first only for a NAVIGATION — resuming from the app switcher is not one. So: once
    on open and every time the app comes back to the foreground, ask the server which commit it is serving; if that
    is not the commit this bundle was built from, reload. Once per new build (sessionStorage), so an edge that lags
    the origin can never loop the app; never when offline. */
export async function reloadIfNewBuild(): Promise<boolean> {
  if (!BUILD_SHA) return false;
  const now = Date.now();
  if (now - lastCheck < CHECK_EVERY_MS) return false;
  lastCheck = now;
  try {
    const r = await fetch("/api/version", { cache: "no-store" });
    if (!r.ok) return false;
    const body = (await r.json()) as { sha?: unknown };
    const sha = typeof body.sha === "string" ? body.sha : "";
    if (!sha || sha === BUILD_SHA) return false;
    if (sessionStorage.getItem(RELOADED_KEY) === sha) return false;
    sessionStorage.setItem(RELOADED_KEY, sha);
    location.reload();
    return true;
  } catch {
    /* offline — the shell the service worker holds is the one to show */
    return false;
  }
}

/** Registers the offline-shell service worker once the page is interactive, and keeps the installed app on the
    newest deploy (reloadIfNewBuild on open and on every return to the foreground). */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    void reloadIfNewBuild();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadIfNewBuild();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);
  return null;
}
