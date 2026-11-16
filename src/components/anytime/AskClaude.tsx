"use client";
import { useEffect, useState } from "react";
import {
  ASK_PROJECT_KEY, ASK_USAGE_KEY, askTarget, askUsageText, bumpAskUsage, readAskProject, readAskUsage, saveAskProject, type AskUsage,
} from "@/lib/ask-claude";

/**
 * The "Ask Claude" button (see src/lib/ask-claude.ts). A plain link to Claude, so it opens under
 * whoever is signed in to Claude on this device: their account, their plan. With a Claude project
 * saved in Settings it opens THAT project, whose chats have read the whole of Parlay Lab; without
 * one it opens a new chat with the question filled in. Either way the tap copies the question.
 * No key, no server call, no cost to this app.
 */

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

const ASK_EVENT = "pl-ask-claude";

/** the project saved on this device; null until mounted, so the server render and the first paint agree */
function useAskProject(): string | null {
  const [project, setProject] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setProject(readAskProject(store()));
    read();
    const onStore = (e: StorageEvent) => { if (e.key === ASK_PROJECT_KEY) read(); };
    window.addEventListener("storage", onStore);
    window.addEventListener(ASK_EVENT, read);
    return () => { window.removeEventListener("storage", onStore); window.removeEventListener(ASK_EVENT, read); };
  }, []);
  return project;
}

export function AskClaudeLink({ prompt, label, project, className = "" }: { prompt: string; label: string; project: string | null; className?: string }) {
  const [sent, setSent] = useState(false);
  const target = askTarget(prompt, project);
  const onAsk = () => {
    bumpAskUsage(store(), Date.now());
    try {
      void navigator.clipboard?.writeText(prompt)?.catch(() => {});
    } catch {
      /* no clipboard on this device: without a project the link still carries the question */
    }
    setSent(true);
    try { window.dispatchEvent(new Event(ASK_EVENT)); } catch { /* nothing listens */ }
  };
  const idle = target.inProject ? "Opens your own Parlay Lab chat in Claude, which knows the whole app." : "Opens Claude in your own account. No key needed.";
  const done = target.inProject ? "Question copied. Paste it into the chat and send." : "Question copied. If Claude opens empty, paste it.";
  return (
    <span data-ask-claude={target.inProject ? "project" : "new"} className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <a href={target.href} target="_blank" rel="noopener noreferrer" onClick={onAsk}
        className="press inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-[#d97757]/50 bg-[#d97757]/10 px-3 text-[12px] font-bold text-text">
        <span aria-hidden className="text-[#d97757]">✳</span>
        {label}
      </a>
      <span className="text-[10px] leading-snug text-faint" role={sent ? "status" : undefined}>{sent ? done : idle}</span>
    </span>
  );
}

export function AskClaude({ prompt, label = "Ask Claude", className = "" }: { prompt: string; label?: string; className?: string }) {
  const project = useAskProject();
  return <AskClaudeLink prompt={prompt} label={label} project={project} className={className} />;
}

/** Settings: how many questions this device has sent. Not plan usage; the app cannot see that. */
export function AskClaudeUsage() {
  const [usage, setUsage] = useState<AskUsage | null>(null);
  useEffect(() => {
    const read = () => setUsage(readAskUsage(store(), Date.now()));
    read();
    const onStore = (e: StorageEvent) => { if (e.key === ASK_USAGE_KEY) read(); };
    window.addEventListener("storage", onStore);
    window.addEventListener(ASK_EVENT, read);
    return () => { window.removeEventListener("storage", onStore); window.removeEventListener(ASK_EVENT, read); };
  }, []);
  return (
    <span data-ask-claude-usage className="num text-right text-[12px] text-muted">
      {usage ? askUsageText(usage) : "…"}
      <span className="block text-[10px] text-faint">sent from this device · answered on your own Claude account</span>
    </span>
  );
}

/** Settings: the Claude project whose chats know Parlay Lab. Typed by the owner; kept on this device only. */
export function AskClaudeProject() {
  const saved = useAskProject();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const save = (raw: string | null) => {
    const r = saveAskProject(store(), raw);
    if (r === "bad") { setNote("That is not a Claude session or project link. It starts with https://claude.ai/code/ or https://claude.ai/project/"); return; }
    setText("");
    setNote(r ? "Saved. Ask Claude now opens this link." : "Removed. Ask Claude opens a new chat.");
    try { window.dispatchEvent(new Event(ASK_EVENT)); } catch { /* nothing listens */ }
  };
  return (
    <div data-ask-claude-project className="w-full space-y-1.5 py-2">
      <p className="text-[11.5px] leading-snug text-muted">
        To make Ask Claude answer with full knowledge of Parlay Lab, paste one of your own Claude links here: the Remote Control link of the Claude Code session that builds this app (it opens for your sign-in only), or a Claude project with the Parlay Lab code connected. Every question then opens there.
      </p>
      <p className="num break-all text-[11.5px] font-semibold text-text">{saved ? saved : "No link saved: questions open in a new chat that only knows what the question says."}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="url" inputMode="url" autoComplete="off" aria-label="Claude session or project link" placeholder="https://claude.ai/code/…" value={text} onChange={(e) => setText(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-white/15 bg-surface-2 px-2.5 text-[12px] text-text" />
        <button type="button" onClick={() => save(text)} disabled={!text.trim()} className="press h-10 rounded-[10px] border border-white/15 bg-surface-2 px-3 text-[12px] font-bold text-text disabled:opacity-40">Save</button>
        {saved && <button type="button" onClick={() => save(null)} className="press h-10 rounded-[10px] border border-white/10 px-3 text-[12px] font-semibold text-muted">Remove</button>}
      </div>
      {note && <p role="status" className="text-[11px] text-gold">{note}</p>}
    </div>
  );
}
