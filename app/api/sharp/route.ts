import fs from "node:fs";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncAuthed } from "@/lib/server/store";

/**
 * The Sharp, server-side. The browser sends today's slate; this route holds
 * the Anthropic key (env), loads the handicapper system prompt from the repo,
 * and returns the structured board. Passcode-gated — this endpoint spends
 * real money per call.
 */
export const maxDuration = 300;

const SH_MODEL = "claude-opus-4-8";
// The legacy app's output contract (SH_SCHEMA) — shRender's 15-pick shape.
const SH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "picks", "parlays", "trap"],
  properties: {
    overview: { type: "string" },
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rank", "player", "prop", "line", "odds", "game", "prob", "implied", "edge", "conviction", "case", "risk"],
        properties: {
          rank: { type: "integer" },
          player: { type: "string" },
          prop: { type: "string" },
          line: { type: "string" },
          odds: { type: "string" },
          game: { type: "string" },
          prob: { type: "number" },
          implied: { type: "number" },
          edge: { type: "number" },
          conviction: { type: "string", enum: ["A", "B", "C"] },
          case: { type: "string" },
          risk: { type: "string" },
        },
      },
    },
    parlays: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["legs", "note"],
        properties: { legs: { type: "array", items: { type: "string" } }, note: { type: "string" } },
      },
    },
    trap: {
      type: "object",
      additionalProperties: false,
      required: ["prop", "reason"],
      properties: { prop: { type: "string" }, reason: { type: "string" } },
    },
  },
} as const;

/** the largest request body read, in characters. An assumption, not a measurement: no caller sends a slate today. */
const SH_MAX_BODY = 500_000;

const tooLarge = () => NextResponse.json({ error: "slate too large" }, { status: 413 });

/** the app passcode in the x-pl-pass header; false when the server has none or the request sent none */
function passAuthed(req: NextRequest): boolean {
  const want = process.env.APP_PASSCODE;
  const got = req.headers.get("x-pl-pass");
  if (!want || !got) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(want), h(got));
}

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "The Sharp isn't configured yet — add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables." },
      { status: 501 },
    );
  }
  /* AUDIT G2-1: FAILS CLOSED. The gate used to apply only when APP_PASSCODE was set, so with it
     unset anyone could spend the Anthropic key, and the body had no size limit. Now a call needs
     the sync phrase or the passcode, both compared in constant time; with neither configured on
     the server nothing passes; and an oversized body is refused before it is parsed. */
  if (!process.env.LEDGER_SYNC_KEY && !process.env.APP_PASSCODE) {
    return NextResponse.json(
      { error: "The Sharp is locked — neither LEDGER_SYNC_KEY nor APP_PASSCODE is set on the server." },
      { status: 503 },
    );
  }
  if (!syncAuthed(req) && !passAuthed(req)) {
    return NextResponse.json({ error: "The Sharp needs your sync phrase — enter it in Settings, then try again." }, { status: 401 });
  }

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > SH_MAX_BODY) return tooLarge();
  let slate: unknown;
  try {
    const text = await req.text();
    if (text.length > SH_MAX_BODY) return tooLarge();
    ({ slate } = JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!slate) return NextResponse.json({ error: "missing slate" }, { status: 400 });

  let systemPrompt: string;
  try {
    systemPrompt = fs.readFileSync(path.join(process.cwd(), "prompts", "mlb_prop_handicapper_prompt.md"), "utf8");
  } catch {
    return NextResponse.json({ error: "system prompt file missing on server" }, { status: 500 });
  }

  const userMsg =
    "Here is today's full MLB slate data as JSON. Every number is live from MLB Stats API and The Odds API; the data_gaps array lists what is unavailable today. Analyze per your instructions and return the board.\n\n" +
    JSON.stringify(slate);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: SH_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: SH_SCHEMA } },
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  const j = (await r.json().catch(() => null)) as {
    error?: { message?: string };
    stop_reason?: string;
    content?: { type: string; text?: string }[];
  } | null;

  if (!r.ok || !j) {
    let m = j?.error?.message || `Claude API error ${r.status}`;
    if (r.status === 401) m = "Anthropic key on the server is invalid.";
    if (r.status === 429) m = "Claude API rate limit hit — wait a minute and retry.";
    return NextResponse.json({ error: m }, { status: 502 });
  }
  if (j.stop_reason === "refusal") return NextResponse.json({ error: "The model declined this request." }, { status: 502 });
  if (j.stop_reason === "max_tokens")
    return NextResponse.json({ error: "Response ran past the output limit — try again." }, { status: 502 });

  let txt = "";
  for (const b of j.content ?? []) if (b.type === "text") txt += b.text ?? "";
  try {
    return NextResponse.json({ board: JSON.parse(txt) });
  } catch {
    return NextResponse.json({ error: "The Sharp returned malformed JSON — try again." }, { status: 502 });
  }
}
