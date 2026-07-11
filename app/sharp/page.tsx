"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { EvBadge } from "@/components/ui/EvBadge";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Reveal } from "@/components/motion/Reveal";
import { getEngine, todayStr } from "@/lib/engine-client";

type SharpBoard = {
  overview: string;
  picks: {
    rank: number;
    player: string;
    prop: string;
    line: string;
    odds: string;
    game: string;
    prob: number;
    implied: number;
    edge: number;
    conviction: "A" | "B" | "C";
    case: string;
    risk: string;
  }[];
  parlays: { legs: string[]; note: string }[];
  trap: { prop: string; reason: string };
};

const KEY = "pl_sharp_ai";

function ConvBadge({ c }: { c: "A" | "B" | "C" }) {
  const tone =
    c === "A" ? "text-pos border-pos/50 bg-pos/10" : c === "B" ? "text-gold border-gold/50 bg-gold/10" : "text-muted border-line-2 bg-surface-2";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>CONVICTION {c}</span>;
}

export default function SharpPage() {
  const [board, setBoard] = useState<SharpBoard | null>(null);
  const [ranAt, setRanAt] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");
  const [err, setErr] = useState("");
  const [needPass, setNeedPass] = useState(false);
  const [pass, setPass] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as { date: string; at: number; board: SharpBoard };
        if (s.date === todayStr()) {
          setBoard(s.board);
          setRanAt(s.at);
        }
      }
      setPass(localStorage.getItem("pl_pass") ?? "");
    } catch {
      /* no saved run */
    }
  }, []);

  const run = async () => {
    setRunning(true);
    setErr("");
    setNeedPass(false);
    try {
      setPhase("Collecting the live slate…");
      const eng = getEngine();
      const slate = await eng.collectSlate();
      setPhase("The Sharp is working the numbers (1–3 minutes)…");
      const r = await fetch("/api/sharp", {
        method: "POST",
        headers: { "content-type": "application/json", ...(pass ? { "x-pl-pass": pass } : {}) },
        body: JSON.stringify({ slate }),
      });
      const j = await r.json();
      if (r.status === 401) {
        setNeedPass(true);
        throw new Error("This endpoint spends API credits — enter your device passcode once.");
      }
      if (!r.ok) throw new Error(j.error || `error ${r.status}`);
      const at = Date.now();
      setBoard(j.board);
      setRanAt(at);
      try {
        localStorage.setItem(KEY, JSON.stringify({ date: todayStr(), at, board: j.board }));
        if (pass) localStorage.setItem("pl_pass", pass);
      } catch {
        /* best-effort persistence */
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setPhase("");
    }
  };

  return (
    <>
      <PageHeader
        title="The Sharp"
        sub="LLM handicapper over the same live slate — structured picks with the case, the risk, and the edge. ~$0.30–0.60 per run."
        action={
          <Pill variant="primary" onClick={run} disabled={running}>
            {running ? phase || "Working…" : board ? "Re-run The Sharp" : "Run The Sharp"}
          </Pill>
        }
      />

      {needPass && (
        <Panel className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-muted">Device passcode:</span>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="num rounded-full border border-line-2 bg-surface-2 px-4 py-2 text-[13px] text-text outline-none focus:border-pos/60"
              placeholder="passcode"
            />
            <Pill variant="primary" onClick={run} disabled={running || !pass}>
              Unlock &amp; run
            </Pill>
          </div>
        </Panel>
      )}

      {err && !needPass && <ErrorState title="The Sharp couldn't finish" body={err} onRetry={run} />}

      {!board && !err && !running && (
        <Panel>
          <EmptyState
            title="No Sharp board today"
            body="One tap collects the live slate and sends it to the handicapper. Your Anthropic key lives on the server — it never ships to this browser."
          />
        </Panel>
      )}

      {board && (
        <div className="space-y-4">
          {ranAt && (
            <div className="text-[11px] text-faint">
              Ran today at {new Date(ranAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} — picks are a
              snapshot, lines move.
            </div>
          )}
          <Reveal>
            <Panel title="Overview">
              <p className="text-[13px] leading-relaxed text-muted">{board.overview}</p>
            </Panel>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-2">
            {board.picks.map((p, i) => (
              <Reveal key={p.rank} delay={Math.min(i * 0.04, 0.3)}>
                <Panel className={p.conviction === "A" ? "glow-pos" : ""}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="display text-[17px] text-text">
                        <span className="num mr-2 text-muted">#{p.rank}</span>
                        {p.player}
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted">
                        {p.prop} {p.line} · {p.game}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="num text-[15px] font-bold text-gold">{p.odds}</span>
                      <ConvBadge c={p.conviction} />
                    </div>
                  </div>
                  <div className="num mt-3 flex flex-wrap items-center gap-3 text-[11.5px]">
                    <span className="text-text">{p.prob}% true</span>
                    <span className="text-muted">{p.implied}% implied</span>
                    <EvBadge ev={p.edge} />
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-muted">{p.case}</p>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-neg/80">⚠ {p.risk}</p>
                </Panel>
              </Reveal>
            ))}
          </div>

          {board.parlays.length > 0 && (
            <Reveal>
              <Panel title="Suggested parlays">
                <div className="space-y-3">
                  {board.parlays.map((pl, i) => (
                    <div key={i} className="border-b border-white/[0.04] pb-3 last:border-0 last:pb-0">
                      <div className="text-[13px] font-medium text-text">{pl.legs.join("  +  ")}</div>
                      <div className="mt-1 text-[11.5px] text-muted">{pl.note}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </Reveal>
          )}

          <Reveal>
            <Panel title="Trap of the day" className="border-neg/20">
              <div className="text-[13px] font-semibold text-neg">{board.trap.prop}</div>
              <div className="mt-1 text-[12px] leading-relaxed text-muted">{board.trap.reason}</div>
            </Panel>
          </Reveal>
        </div>
      )}

      <div className="mt-6 text-[10.5px] text-faint">
        The Sharp reasons over live data but is still a model — track it in the ledger like everything else.
        Informational only, not betting advice.
      </div>
    </>
  );
}
