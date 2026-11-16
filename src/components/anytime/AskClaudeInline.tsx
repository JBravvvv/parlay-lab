"use client";
import { useEffect, useRef, useState } from "react";
import { AskClaude } from "./AskClaude";
import { ASK_NOTE_MAX, ASK_PAIR_KEY, askStatusText, pairCodeOf, starterMessage, type AskPhase, type AskQuestion } from "@/lib/ask-mailbox";
import { awaitAnswer, readPairCode, savePairCode, sendQuestion } from "@/lib/ask-mailbox-client";
import { bumpAskUsage } from "@/lib/ask-claude";
import { getSyncKey } from "@/lib/ledgerSync";

/**
 * ASK CLAUDE, ANSWERED HERE (2026-11-16; the design is in src/lib/ask-mailbox.ts). One button: it
 * sends the question to the owner's own Claude chat and puts the answer on this page. Beside it, a
 * small "Why" button opens Claude's short explanation; the full question and answer stay in that
 * chat. On a device that is not paired it is the older link to Claude instead, so nobody else's
 * question ever goes anywhere but their own Claude.
 */

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};
const PAIR_EVENT = "pl-ask-pair";

function usePairCode(): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setCode(readPairCode(store()));
    read();
    const onStore = (e: StorageEvent) => { if (e.key === ASK_PAIR_KEY) read(); };
    window.addEventListener("storage", onStore);
    window.addEventListener(PAIR_EVENT, read);
    return () => { window.removeEventListener("storage", onStore); window.removeEventListener(PAIR_EVENT, read); };
  }, []);
  return code;
}

export function AskClaudeInline({ label, build, onAnswer, fallbackPrompt, noteLabel = "Tell Claude what you want (optional)" }: {
  label: string;
  /** the question as it stands right now, with what the owner typed; null = nothing to ask */
  build: (note: string) => AskQuestion | null;
  /** put the picks on the page; says how many were seated and how many had left the board */
  onAnswer?: (legIds: readonly string[]) => { seated: number; refused: number };
  /** the question for the plain link, used on a device that is not paired */
  fallbackPrompt: string;
  noteLabel?: string;
}) {
  const code = usePairCode();
  const [phase, setPhase] = useState<AskPhase>({ kind: "idle" });
  const [note, setNote] = useState("");
  const [why, setWhy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  if (!code) return <AskClaude label={label} prompt={fallbackPrompt} />;

  const busy = phase.kind === "sending" || phase.kind === "waiting";
  const ask = async () => {
    if (busy) return;
    setWhy(false);
    const q = build(note);
    if (!q) { setPhase({ kind: "failed", why: "nothing" }); return; }
    const sync = getSyncKey();
    if (!sync) { setPhase({ kind: "failed", why: "signin" }); return; }
    setPhase({ kind: "sending" });
    bumpAskUsage(store(), Date.now());
    try { window.dispatchEvent(new Event("pl-ask-claude")); } catch { /* nothing listens */ }
    const sent = await sendQuestion(q, { sync, code });
    if (!alive.current) return;
    if (!sent.ok) { setPhase({ kind: "failed", why: sent.why }); return; }
    setPhase({ kind: "waiting", since: Date.now() });
    const ans = await awaitAnswer(sent.id, { sync, alive: () => alive.current });
    if (!alive.current) return;
    if (!ans) { setPhase({ kind: "failed", why: "unreachable" }); return; }
    const put = onAnswer ? onAnswer(ans.legIds) : { seated: 0, refused: 0 };
    setPhase({ kind: "answered", seated: put.seated, refused: put.refused, summary: ans.summary });
  };
  const status = askStatusText(phase);
  return (
    <div data-ask-claude="inline" className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={ask} disabled={busy} aria-busy={busy}
          className="press inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#d97757]/50 bg-[#d97757]/10 px-3 text-[12px] font-bold text-text disabled:opacity-60">
          <span aria-hidden className={`text-[#d97757] ${busy ? "animate-pulse" : ""}`}>✳</span>
          {busy ? "Asking Claude…" : label}
        </button>
        {phase.kind === "answered" && (
          <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-controls="ask-claude-why" data-ask-claude-why
            className="press inline-flex h-7 items-center rounded-full border border-white/15 px-2 text-[10px] font-bold text-muted">
            Why {why ? "▴" : "▾"}
          </button>
        )}
        <input type="text" value={note} onChange={(e) => setNote(e.target.value.slice(0, ASK_NOTE_MAX))} disabled={busy} aria-label={noteLabel} placeholder={noteLabel}
          className="h-9 min-w-[9rem] flex-1 rounded-[10px] border border-white/10 bg-surface-2 px-2.5 text-[11.5px] text-text placeholder:text-faint" />
      </div>
      {status && <p role="status" className={`text-[10.5px] leading-snug ${phase.kind === "failed" ? "text-gold" : "text-muted"}`}>{status}</p>}
      {phase.kind === "answered" && why && (
        <p id="ask-claude-why" className="rounded-[10px] border border-white/[0.08] bg-surface-2 px-2.5 py-2 text-[11px] leading-snug text-text">
          {phase.summary}
          <span className="mt-1 block text-[10px] text-faint">Claude's short reason. The full question and answer are in your Parlay Lab answering chat. Paper picks; information, not betting advice.</span>
        </p>
      )}
    </div>
  );
}

/** Settings: pair this device with the answering chat. The code is made here and never leaves the device except in a header. */
export function AskClaudePair() {
  const code = usePairCode();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const changed = () => { try { window.dispatchEvent(new Event(PAIR_EVENT)); } catch { /* nothing listens */ } };
  const create = () => {
    try {
      const made = pairCodeOf(crypto.getRandomValues(new Uint8Array(16)));
      if (!made || savePairCode(store(), made) === "bad") { setNote("This browser could not make a code."); return; }
      setNote("Code made. Now copy the starter message into a new Claude chat on your Mac.");
      changed();
    } catch {
      setNote("This browser could not make a code.");
    }
  };
  const save = (raw: string | null) => {
    const r = savePairCode(store(), raw);
    if (r === "bad") { setNote("That is not a pairing code. Copy it from the device where you made it."); return; }
    setText("");
    setNote(r ? "Saved. This device now uses the same answering chat." : "Removed. Ask Claude opens Claude in a new tab again.");
    changed();
  };
  const copy = async (what: string, done: string) => {
    try {
      await navigator.clipboard.writeText(what);
      setNote(done);
    } catch {
      setNote("This browser would not copy. Try again from a tap.");
    }
  };
  return (
    <div data-ask-claude-pair className="w-full space-y-1.5 py-2">
      <p className="text-[11.5px] leading-snug text-muted">
        Answers inside Parlay Lab: pair this app with one Claude chat on your Mac. Ask Claude then sends the question there and puts Claude's picks straight on the page. It answers only while that chat is open and your Mac is awake.
      </p>
      <p className="text-[11.5px] font-semibold text-text">{code ? "Paired on this device." : "Not paired on this device: Ask Claude opens Claude in a new tab."}</p>
      <div className="flex flex-wrap items-center gap-2">
        {!code && <button type="button" onClick={create} className="press h-10 rounded-[10px] border border-[#d97757]/50 bg-[#d97757]/10 px-3 text-[12px] font-bold text-text">Make a pairing code</button>}
        {code && <button type="button" onClick={() => copy(starterMessage(code), "Starter message copied. Paste it into a new Claude chat on your Mac and send it.")} className="press h-10 rounded-[10px] border border-[#d97757]/50 bg-[#d97757]/10 px-3 text-[12px] font-bold text-text">Copy starter message</button>}
        {code && <button type="button" onClick={() => copy(code, "Code copied. Paste it in Settings on your other device.")} className="press h-10 rounded-[10px] border border-white/15 bg-surface-2 px-3 text-[12px] font-bold text-text">Copy code for another device</button>}
        {code && <button type="button" onClick={() => save(null)} className="press h-10 rounded-[10px] border border-white/10 px-3 text-[12px] font-semibold text-muted">Unpair</button>}
      </div>
      {!code && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" autoComplete="off" spellCheck={false} aria-label="Pairing code from another device" placeholder="Or paste a code from another device" value={text} onChange={(e) => setText(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-[10px] border border-white/15 bg-surface-2 px-2.5 text-[12px] text-text" />
          <button type="button" onClick={() => save(text)} disabled={!text.trim()} className="press h-10 rounded-[10px] border border-white/15 bg-surface-2 px-3 text-[12px] font-bold text-text disabled:opacity-40">Save</button>
        </div>
      )}
      {note && <p role="status" className="text-[11px] text-gold">{note}</p>}
    </div>
  );
}
