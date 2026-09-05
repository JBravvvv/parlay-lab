"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { CalcHero } from "@/components/calc/CalcHero";
import { CalcLadder } from "@/components/calc/CalcLadder";
import { CalcStats } from "@/components/calc/CalcStats";
import { LegCard, type LegValue } from "@/components/calc/LegCard";
import { QuickAdd } from "@/components/calc/QuickAdd";
import { ShareButton } from "@/components/calc/ShareButton";
import { StakeInput } from "@/components/calc/StakeInput";
import {
  decimalToAmerican,
  evPct,
  fmtCents,
  impliedProb,
  jointProb,
  ladder,
  parlayDecimal,
  parseConfidence,
  parseOdds,
  payout,
  profit,
  summaryText,
} from "@/lib/calc-math";

/**
 * PARLAY CALC (2026-08-20, Josh's word, verbatim: "Add a parlay calculator tab where you
 * can enter any amount for the bet and it has lines for each bet of the parlay to enter
 * the odds. It should start with 2 lines for bets then have a '+ a leg' button
 * underneath … At the bottom it should have 'wins' and 'pays' amounts.")
 *
 * INSTRUCTION 40 (2026-09-05), Josh: "Make the UI on the Parlay Calc significantly more
 * intriguing to use … I want a billionaire CEO to look at this website & first thought
 * is they immediately want to purchase it or invest in it." Rebuilt as an instrument:
 * a rolling gold PAYS hero, leg cards that take American OR decimal and show the other,
 * a quick-add price strip, stake presets, live stat tiles (true probability + EV when
 * the user rates every leg), the edge meter, a payout ladder, and a copy-ticket button.
 * Every function of the original stays: two starting legs, "+ a leg", American odds per
 * leg, any stake, Wins (profit) and Pays (full return). All math lives in
 * src/lib/calc-math.ts — free-standing on the user's own numbers, no board, no engine.
 */

type Extra = { id: number; conf: string; push: boolean };
let nextId = 3;
const freshExtra = (): Extra => ({ id: nextId++, conf: "", push: false });

const STAKE_RE = /^\d+(\.\d{1,2})?$/;

export default function CalcPage() {
  const [stake, setStake] = useState("10");
  // starts with 2 lines for bets, per the instruction (odds strings; extras ride in lockstep)
  const [legs, setLegs] = useState<string[]>(["", ""]);
  const [extras, setExtras] = useState<Extra[]>([
    { id: 1, conf: "", push: false },
    { id: 2, conf: "", push: false },
  ]);
  const focusIdx = useRef<number | null>(null);

  const stakeNum = Number(stake);
  const stakeOk = STAKE_RE.test(stake.trim()) && stakeNum > 0;

  const setLeg = (i: number, v: LegValue) => {
    setLegs((ls) => ls.map((x, j) => (j === i ? v.odds : x)));
    setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, conf: v.conf, push: v.push } : x)));
  };
  const addLeg = (odds = "") => {
    focusIdx.current = legs.length;
    setLegs((ls) => [...ls, odds]);
    setExtras((xs) => [...xs, freshExtra()]);
  };
  const removeLeg = (i: number) => {
    if (legs.length <= 2) return;
    focusIdx.current = null;
    setLegs((ls) => ls.filter((_, j) => j !== i));
    setExtras((xs) => xs.filter((_, j) => j !== i));
  };
  const quickAdd = (american: number) => {
    const text = american > 0 ? `+${american}` : `${american}`;
    const empty = legs.findIndex((v, j) => v.trim() === "" && !extras[j]?.push);
    if (empty >= 0) {
      focusIdx.current = null;
      setLegs((ls) => ls.map((x, j) => (j === empty ? text : x)));
    } else addLeg(text);
  };

  const model = useMemo(() => {
    const parsed = legs.map((v) => parseOdds(v));
    const liveIdx = legs.map((_, i) => i).filter((i) => !extras[i]?.push);
    const allPriced = liveIdx.every((i) => parsed[i] != null);
    const live = stakeOk && liveIdx.length > 0 && allPriced;
    const decimals = liveIdx.map((i) => parsed[i]?.decimal ?? 1);
    const dec = parlayDecimal(decimals);
    const american = decimalToAmerican(dec);
    const implied = impliedProb(dec);
    const confs = liveIdx.map((i) => parseConfidence(extras[i]?.conf ?? ""));
    const filled = confs.filter((c): c is number => c != null);
    const trueProb = live && filled.length === liveIdx.length ? jointProb(filled) : null;
    const ev = trueProb == null ? null : evPct(trueProb, dec);
    const pays = live ? payout(stakeNum, dec) : 0;
    const wins = live ? profit(stakeNum, dec) : 0;
    const rungs = live ? ladder(stakeNum, decimals) : [];
    const text = live
      ? summaryText({
          stake: stakeNum,
          legs: liveIdx.map((i) => ({ label: "", american: parsed[i]!.american })),
          decimal: dec,
          american,
          pays,
          wins,
          impliedProb: implied,
        })
      : "";
    return { live, liveCount: liveIdx.length, dec, american, implied, trueProb, ev, pays, wins, rungs, text, filled: filled.length };
  }, [legs, extras, stakeOk, stakeNum]);

  const hint = !stakeOk
    ? "Enter a bet amount to light the ticket."
    : model.liveCount === 0
      ? "Every leg is a push — un-void one to price the ticket."
      : "Price every leg — +150, -110, or 2.50 — and the ticket lights up.";

  return (
    <>
      <PageHeader
        eyebrow="Instrument"
        title="Parlay Calc"
        sub="Your stake, your prices. Wins is profit; Pays is the full return with the stake back in. American or decimal on any leg."
        action={<ShareButton text={model.text} disabled={!model.live} />}
      />
      <div className="mx-auto max-w-[560px] space-y-4">
        <CalcHero
          live={model.live}
          legs={model.liveCount}
          pays={model.pays}
          wins={model.wins}
          american={model.american}
          decimal={model.dec}
          implied={model.implied}
          hint={hint}
        />

        <Panel title="Stake">
          <StakeInput value={stake} onChange={setStake} valid={stakeOk} />
        </Panel>

        <Panel
          title="Legs"
          action={<span className="num text-[10.5px] text-faint">{legs.length} on the ticket</span>}
        >
          <QuickAdd onPick={quickAdd} />
          <div className="mt-3 space-y-2.5">
            <AnimatePresence initial={false}>
              {legs.map((v, i) => (
                <LegCard
                  key={extras[i]?.id ?? i}
                  index={i}
                  value={{ odds: v, conf: extras[i]?.conf ?? "", push: extras[i]?.push ?? false }}
                  onChange={(next) => setLeg(i, next)}
                  onRemove={() => removeLeg(i)}
                  removable={legs.length > 2}
                  autoFocus={focusIdx.current === i}
                />
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-4">
            <Pill variant="gold" type="button" onClick={() => addLeg()} className="h-[44px] px-5 text-[13px]">
              + a leg
            </Pill>
          </div>
        </Panel>

        <Panel title="The ticket in numbers">
          <CalcStats
            live={model.live}
            american={model.american}
            decimal={model.dec}
            implied={model.implied}
            trueProb={model.trueProb}
            ev={model.ev}
            pays={model.pays}
            wins={model.wins}
            legsFilled={model.filled}
            legsLive={model.liveCount}
          />
        </Panel>

        <Panel title="Payout ladder">
          <CalcLadder rungs={model.rungs} stake={stakeNum} />
        </Panel>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-pos/25 bg-pos/[0.05] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-pos/80">Wins</div>
            <div className={`num mt-1 text-[24px] font-bold ${model.live ? "text-pos" : "text-faint"}`}>
              {model.live ? fmtCents(model.wins) : "—"}
            </div>
          </div>
          <div className="rounded-2xl border border-gold/30 bg-gold/[0.07] px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gold/80">Pays</div>
            <div className={`num mt-1 text-[24px] font-bold ${model.live ? "text-gold" : "text-faint"}`}>
              {model.live ? fmtCents(model.pays) : "—"}
            </div>
          </div>
        </div>

        <div className="pb-2 text-center text-[10px] text-faint">
          Straight multiplication of your own prices — informational only, not betting advice.
        </div>
      </div>
    </>
  );
}
