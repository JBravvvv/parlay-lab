"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Pill, FilterPill } from "@/components/ui/Pill";
import { EvBadge } from "@/components/ui/EvBadge";
import { amToDec, decToAm, fmtAm, type UfcFight } from "@/lib/ufc";

/* UFC props desk — method of victory, round of finish, anything exclusive.
   The odds feed carries NO MMA prop markets at any book (verified against the
   API on fight night), so prices are typed in from the Caesars app / window.
   Nothing is invented: you supply the prices, the desk de-vigs the market,
   anchors fighter totals to the 7-book moneyline consensus, and shows every
   outcome's true %, fair price and EV — then legs can join the slip. */

export type PropLeg = { groupId: string; fight: string; pick: string; czOdds: number; prob: number };

type Row = { label: string; side: "a" | "b" | "x"; odds: string };
type Template = "method" | "round" | "custom";

const implied = (a: number) => (a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100));
const parseAm = (s: string): number | null => {
  const n = Number(s.replace(/\s/g, ""));
  return Number.isFinite(n) && Math.abs(n) >= 100 ? n : null;
};
const fmtPct = (p: number) => `${(p * 100).toFixed(1)}%`;

function methodRows(a: string, b: string): Row[] {
  return [
    { label: `${a} by KO/TKO`, side: "a", odds: "" },
    { label: `${a} by Submission`, side: "a", odds: "" },
    { label: `${a} by Decision`, side: "a", odds: "" },
    { label: `${b} by KO/TKO`, side: "b", odds: "" },
    { label: `${b} by Submission`, side: "b", odds: "" },
    { label: `${b} by Decision`, side: "b", odds: "" },
    { label: "Draw / No contest", side: "x", odds: "" },
  ];
}
function roundRows(rounds: number): Row[] {
  const r: Row[] = [];
  for (let i = 1; i <= rounds; i++) r.push({ label: `Ends in Round ${i}`, side: "x", odds: "" });
  r.push({ label: "Goes the distance", side: "x", odds: "" });
  return r;
}

export function UfcProps({ fights, onAdd }: { fights: UfcFight[]; onAdd: (leg: PropLeg) => void }) {
  const [fightId, setFightId] = useState("");
  const [template, setTemplate] = useState<Template>("method");
  const [rows, setRows] = useState<Row[]>([]);
  const [started, setStarted] = useState(false);

  const fight = fights.find((f) => f.id === fightId) ?? null;

  const start = (t: Template, fid: string) => {
    const f = fights.find((x) => x.id === fid) ?? null;
    setTemplate(t);
    setFightId(fid);
    setStarted(true);
    if (t === "method") setRows(methodRows(f?.a.name ?? "Fighter A", f?.b.name ?? "Fighter B"));
    else if (t === "round") setRows(roundRows(3));
    else setRows([{ label: "", side: "x", odds: "" }, { label: "", side: "x", odds: "" }]);
  };

  const calc = useMemo(() => {
    const filled = rows
      .map((r, i) => ({ ...r, i, am: parseAm(r.odds) }))
      .filter((r): r is typeof r & { am: number } => r.am != null && r.label.trim() !== "");
    if (filled.length < 2) return null;

    const imps = filled.map((r) => implied(r.am));
    const over = imps.reduce((a, b) => a + b, 0);
    const devig = imps.map((x) => x / over);

    /* anchor fighter totals to the multi-book ML consensus when we can */
    let adj = devig;
    let anchored = false;
    if (template === "method" && fight?.a.prob != null && fight?.b.prob != null) {
      const dIdx = filled.findIndex((r) => r.side === "x");
      const d = dIdx >= 0 ? devig[dIdx] : 0;
      const sumA = filled.reduce((s, r, i) => s + (r.side === "a" ? devig[i] : 0), 0);
      const sumB = filled.reduce((s, r, i) => s + (r.side === "b" ? devig[i] : 0), 0);
      if (sumA > 0 && sumB > 0) {
        const tgtA = fight.a.prob * (1 - d);
        const tgtB = fight.b.prob * (1 - d);
        adj = filled.map((r, i) =>
          r.side === "a" ? (devig[i] * tgtA) / sumA : r.side === "b" ? (devig[i] * tgtB) / sumB : devig[i],
        );
        anchored = true;
      }
    }

    const out = filled.map((r, i) => {
      const dec = amToDec(r.am);
      const prob = adj[i];
      return {
        i: r.i,
        label: r.label,
        am: r.am,
        implied: imps[i],
        prob,
        fair: decToAm(1 / prob),
        ev: prob * dec - 1,
      };
    });
    return { out, over, anchored };
  }, [rows, template, fight]);

  const groupId = fight ? fight.id : `prop-${template}`;
  const fightLabel = fight ? `${fight.a.name} vs ${fight.b.name}` : "Custom market";

  return (
    <Panel title="UFC props — method · round · anything exclusive" className="mt-6">
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
        The national odds feed carries <b className="text-text">no MMA props at any book</b> (checked live against the
        API), so these prices come from you: open the Caesars app, type what it shows for one market, and the desk
        de-vigs it{fights.length > 0 ? ", anchors it to the 7-book moneyline consensus," : ""} and prices every
        outcome honestly.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {fights.length > 0 && (
          <select
            value={fightId}
            onChange={(e) => started ? start(template, e.target.value) : setFightId(e.target.value)}
            className="rounded-full border border-line-2 bg-white/[0.03] px-3 py-1.5 text-[11.5px] font-semibold text-muted outline-none transition-colors hover:text-text focus:border-pos/60"
          >
            <option value="">Pick a fight…</option>
            {fights.map((f) => (
              <option key={f.id} value={f.id}>{f.a.name} vs {f.b.name}</option>
            ))}
          </select>
        )}
        <FilterPill selected={started && template === "method"} onClick={() => start("method", fightId)}>
          Method of victory
        </FilterPill>
        <FilterPill selected={started && template === "round"} onClick={() => start("round", fightId)}>
          Round of finish
        </FilterPill>
        <FilterPill selected={started && template === "custom"} onClick={() => start("custom", fightId)}>
          Custom
        </FilterPill>
      </div>

      {started && (
        <>
          <div className="mt-4 space-y-2">
            {rows.map((r, i) => {
              const c = calc?.out.find((o) => o.i === i);
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    value={r.label}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Outcome (e.g. Ends in Round 1)"
                    className="min-w-[150px] flex-1 rounded-full border border-line-2 bg-white/[0.03] px-3.5 py-1.5 text-[12px] text-text outline-none placeholder:text-faint focus:border-pos/60 md:max-w-[260px]"
                  />
                  <input
                    value={r.odds}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, odds: e.target.value } : x)))}
                    placeholder="+275"
                    inputMode="text"
                    className="num w-[84px] rounded-full border border-line-2 bg-white/[0.03] px-3 py-1.5 text-[12px] text-gold outline-none placeholder:text-faint focus:border-pos/60"
                  />
                  {c ? (
                    <span className="num flex flex-wrap items-center gap-2.5 text-[11px] text-muted">
                      <span>true <b className="text-text">{fmtPct(c.prob)}</b></span>
                      <span>fair {fmtAm(c.fair)}</span>
                      {calc!.anchored && <EvBadge ev={c.ev * 100} />}
                      <button
                        onClick={() => onAdd({ groupId, fight: fightLabel, pick: c.label, czOdds: c.am, prob: c.prob })}
                        className="rounded-full border border-pos/50 bg-pos/10 px-2.5 py-0.5 text-[10.5px] font-bold text-pos hover:bg-pos/20"
                      >
                        ＋ slip
                      </button>
                    </span>
                  ) : (
                    <span className="text-[10.5px] text-faint">{r.odds && parseAm(r.odds) == null ? "odds like -150 / +275" : ""}</span>
                  )}
                  <button
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    className="rounded-full px-1.5 text-[12px] text-neg hover:bg-neg/10"
                    aria-label="remove row"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Pill variant="ghost" className="!px-3 !py-1 text-[11px]" onClick={() => setRows((rs) => [...rs, { label: "", side: "x", odds: "" }])}>
              ＋ Add outcome
            </Pill>
            {calc && (
              <span className="num text-[11px] text-muted">
                book overround <b className="text-text">{fmtPct(calc.over)}</b> ({fmtPct(calc.over - 1)} juice)
                {calc.anchored && <span className="ml-2 text-pos">· anchored to ML consensus</span>}
              </span>
            )}
          </div>

          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            Fill at least two outcomes of ONE market (they must cover exclusive results). True % strips the juice;
            {" "}with a fight selected on Method, fighter totals are re-anchored to the multi-book moneyline consensus —
            an EV badge there means Caesars&apos; method split disagrees with the wider market, which is a real,
            checkable gap. Round markets can&apos;t be anchored, so their EV isn&apos;t shown — the true % and fair
            price still tell you what you&apos;re paying. Outcomes from one market are exclusive: only one can join a
            slip, and never alongside a moneyline from the same fight.
          </p>
        </>
      )}
    </Panel>
  );
}
