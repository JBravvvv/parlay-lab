import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

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

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "The Sharp isn't configured yet — add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables." },
      { status: 501 },
    );
  }
  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers.get("x-pl-pass") !== pass) {
    return NextResponse.json({ error: "passcode" }, { status: 401 });
  }

  let slate: unknown;
  try {
    ({ slate } = await req.json());
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
