"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getSport, isSport, setSport, useSport } from "@/lib/sport";
import { pacificDate, relevantSport } from "@/lib/relevant-sport";
import { currentSession, readSession, SessionScope, startSession, writeSession } from "@/lib/use-session-state";
const RESUMABLE = /^\/(games|board|props|builder|stats|ledger|calc|sharp|simulator|first-sunday-six)(\?|$|\/)/;
/** Bootstrap before page hooks mount so restored drafts never get overwritten by defaults. */
export function WorkspaceSession({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const session = startSession();
    const controller = new AbortController();
    const saved = readSession<unknown>("sport", () => null);
    if (session.restored && isSport(saved)) setSport(saved, false);
    else {
      setSport(relevantSport(pacificDate()), false);
      void fetch("/api/relevant-sport", { cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : null).then(data => {
        if (data?.date === pacificDate() && isSport(data.sport) && !readSession("sport-manual", () => false)) setSport(data.sport, false);
      }).catch(() => {});
    }
    setReady(true);
    const hidden = () => { if (document.visibilityState === "hidden") session.flush(); else session.resume(); };
    const pagehide = (event: PageTransitionEvent) => { if (event.persisted) session.flush(); else session.close(); };
    const pageshow = () => session.resume();
    const beat = window.setInterval(() => { if (document.visibilityState === "visible") session.flush(); }, 30_000);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    return () => { controller.abort(); session.flush(); clearInterval(beat); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", pagehide); window.removeEventListener("pageshow", pageshow); };
  }, []);
  return ready ? <WorkspaceRoutes>{children}</WorkspaceRoutes> : <div className="p-5 text-sm text-muted" role="status">Opening Parlay Lab…</div>;
}
function WorkspaceRoutes({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const sport = useSport();
  const restoredRoute = useRef(false);
  const query = params.toString();
  const url = pathname + (query ? `?${query}` : "");
  const scope = `${pathname}:${sport}`;
  useEffect(() => {
    // The root redirect can briefly report / before /games; do not overwrite the saved page.
    if (pathname === "/") return;
    if (!restoredRoute.current) {
      restoredRoute.current = true;
      const prior = readSession<string | null>("route", () => null);
      if (currentSession()?.restored && pathname === "/games" && !query && prior && prior !== url && RESUMABLE.test(prior)) {
        router.replace(prior); return;
      }
    }
    writeSession("route", url, false);
  }, [url, pathname, query, router]);
  useEffect(() => { writeSession("sport", getSport(), false); }, [sport]);
  useEffect(() => {
    const key = `scroll:${url}:${sport}`;
    const saved = readSession<number>(key, () => 0);
    let restoring = saved > 0;
    let position = saved;
    let frame = 0;
    const restore = () => {
      if (!restoring) return;
      window.scrollTo({ top: saved, behavior: "instant" });
      if (Math.abs(window.scrollY - saved) < 2) restoring = false;
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); });
    if (restoring) { observer.observe(document.body); frame = requestAnimationFrame(restore); }
    const onInput = () => { restoring = false; };
    const onScroll = () => { if (!restoring) { position = window.scrollY; writeSession(key, position, false); } };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("touchstart", onInput, { passive: true });
    window.addEventListener("wheel", onInput, { passive: true });
    window.addEventListener("keydown", onInput);
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      writeSession(key, position, false);
      window.removeEventListener("scroll", onScroll); window.removeEventListener("touchstart", onInput);
      window.removeEventListener("wheel", onInput); window.removeEventListener("keydown", onInput);
    };
  }, [url, sport]);
  return <SessionScope.Provider value={scope}>{children}</SessionScope.Provider>;
}
