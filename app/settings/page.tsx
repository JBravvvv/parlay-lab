"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { getMoney, setMoney, getSelectionMode, setSelectionMode, type SelectionMode } from "@/lib/engine-client";
import { getSyncKey, setSyncKey, syncNow, useSyncState } from "@/lib/ledgerSync";
import { invalidateCalibration, useCalibration } from "@/lib/useCalibration";

/* Selection mode + calibration kill switch (calibration spec Update 1 / 3D) */
function SelectionCalibrationPanel() {
  const cal = useCalibration();
  const [mode, setMode] = useState<SelectionMode>("ev_gated");
  const [auto, setAuto] = useState<"on" | "off">("on");
  const [note, setNote] = useState("");
  useEffect(() => setMode(getSelectionMode()), []);
  useEffect(() => setAuto(cal.auto), [cal.auto]);

  const flipMode = (m: SelectionMode) => {
    setMode(m);
    setSelectionMode(m);
    setNote("Saved — takes effect on the next card calc / Sharp read.");
    setTimeout(() => setNote(""), 2500);
  };
  const flipAuto = async (v: "on" | "off") => {
    setAuto(v);
    try {
      const r = await fetch("/api/calibration", {
        method: "POST",
        headers: { "x-pl-sync": getSyncKey(), "content-type": "application/json" },
        body: JSON.stringify({ auto: v }),
      });
      if (!r.ok) throw new Error(String(r.status));
      invalidateCalibration();
      setNote(v === "off" ? "Auto-calibration OFF — flagging and reporting still run." : "Auto-calibration ON.");
    } catch {
      setNote("Couldn't reach the store — is Ledger sync set up with your phrase?");
      setAuto(cal.auto);
    }
    setTimeout(() => setNote(""), 4000);
  };

  return (
    <Panel title="Pick selection & calibration">
      <Row label="Selection mode (The Sharp's plays + Builder suggestions)">
        <div className="flex flex-wrap gap-1.5">
          <Pill variant={mode === "dk_fd" ? "primary" : "ghost"} onClick={() => flipMode("dk_fd")} className="!px-3 !py-1 text-[11px]">
            DK/FD basis (recommended)
          </Pill>
          <Pill variant={mode === "ev_gated" ? "primary" : "ghost"} onClick={() => flipMode("ev_gated")} className="!px-3 !py-1 text-[11px]">
            EV-gated @ CZ
          </Pill>
          <Pill variant={mode === "probability" ? "primary" : "ghost"} onClick={() => flipMode("probability")} className="!px-3 !py-1 text-[11px]">
            True probability
          </Pill>
          <Pill variant={mode === "caesars_ev" ? "primary" : "ghost"} onClick={() => flipMode("caesars_ev")} className="!px-3 !py-1 text-[11px]">
            Caesars EV
          </Pill>
        </div>
      </Row>
      <Row label="Auto-calibration (self-correcting blend weights)">
        <div className="flex gap-1.5">
          <Pill variant={auto === "on" ? "primary" : "ghost"} onClick={() => void flipAuto("on")} className="!px-3 !py-1 text-[11px]">
            On
          </Pill>
          <Pill variant={auto === "off" ? "primary" : "ghost"} onClick={() => void flipAuto("off")} className="!px-3 !py-1 text-[11px]">
            Off
          </Pill>
        </div>
      </Row>
      {note && <div className="pt-1 text-[11.5px] text-pos">{note}</div>}
      <div className="pt-2 text-[11px] leading-relaxed text-faint">
        <b className="text-muted">DK/FD basis</b> (default): all selection math — the EV gate, edge badges, Kelly,
        FUN tiers — computes at the better de-vigged price between DraftKings and FanDuel only (tie goes to DK);
        no other book&apos;s price influences selection. The consensus fair probability stays the model&apos;s anchor
        — this swaps the price the model shops at, not the opinion it holds. A leg with no DK/FD quote is ineligible
        for the card (flagged, still board-visible); card legs also still need a Caesars quote, because CZ remains
        display + settlement only. <b className="text-muted">EV-gated @ CZ</b>: the same discipline priced at
        Caesars — a day with no qualifying ticket is a NO-PLAY day with $0 recommended, and staking anyway takes an
        explicit override that the ledger tracks separately. Zero edge, zero stake.{" "}
        <b className="text-muted">True probability</b>: picks are chosen by the engine&apos;s blended true %
        anchored to the full multi-book consensus — Caesars only prices and sizes what was already chosen, and picks
        it doesn&apos;t offer are listed separately, never substituted. <b className="text-muted">Caesars EV</b> is the
        legacy ranking by playable edge at CZ. Auto-calibration lets the nightly grader shrink a market&apos;s model
        weight toward the consensus when 150+ graded picks show statistically significant overconfidence (capped ±10%
        per week, shrink-only, every change logged under Stats → Calibration). Off = reporting continues, weights stay
        at the shipped defaults.
      </div>
    </Panel>
  );
}

/* Ledger cloud sync — one phrase, every device shares one season record */
function LedgerSyncPanel() {
  const st = useSyncState();
  const [phrase, setPhrase] = useState("");
  // probe server config on open so the setup steps show before a phrase exists
  const [needsSetup, setNeedsSetup] = useState<string[] | null>(null);
  useEffect(() => {
    setPhrase(getSyncKey());
    fetch("/api/ledger", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 503) {
          const j = (await r.json().catch(() => ({}))) as { missing?: string[] };
          setNeedsSetup(j.missing ?? ["store", "key"]);
        } else setNeedsSetup([]);
      })
      .catch(() => {});
  }, []);
  const on = getSyncKey() !== "";
  const missing = st.kind === "not-configured" ? st.missing : (needsSetup ?? []);

  const statusLine = () => {
    switch (st.kind) {
      case "off":
        return <span className="text-[12px] text-muted">Off — enter your sync phrase below to link this device</span>;
      case "syncing":
        return <span className="text-[12px] text-muted">Syncing…</span>;
      case "synced":
        return (
          <span className="num text-[12.5px] text-pos">
            Synced · {st.days} locked day{st.days === 1 ? "" : "s"} ·{" "}
            {new Date(st.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
        );
      case "not-configured":
        return <span className="text-[12px] font-semibold text-gold">Cloud store not set up yet — steps below</span>;
      case "bad-key":
        return <span className="text-[12px] font-semibold text-neg">Phrase doesn&apos;t match LEDGER_SYNC_KEY on Vercel</span>;
      case "error":
        return <span className="text-[12px] text-gold">{st.detail}</span>;
    }
  };

  return (
    <Panel title="Ledger sync — one record, every device">
      <Row label="Status">{statusLine()}</Row>
      <Row label="Sync phrase (same on every device)">
        <input
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          placeholder="not set"
          autoComplete="off"
          className="num w-44 rounded-full border border-line-2 bg-surface-2 px-3 py-1.5 text-[13px] text-text outline-none focus:border-pos/50"
        />
        <Pill variant="primary" onClick={() => setSyncKey(phrase)} className="!px-3 !py-1 text-[11px]">
          {on ? "Update" : "Turn on"}
        </Pill>
        {on && (
          <Pill variant="ghost" onClick={() => void syncNow()} className="!px-3 !py-1 text-[11px]">
            Sync now
          </Pill>
        )}
      </Row>
      <div className="pt-2 text-[11px] leading-relaxed text-faint">
        With sync on, every locked card, grade, and CLV sighting lands on all your devices automatically —
        syncs on open, on returning to the app, and within a minute of any change. Locked days are merged,
        never overwritten, so no device can erase another&apos;s record.
      </div>
      {missing.length > 0 && (
        <div className="mt-3 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3 text-[12px] leading-relaxed text-muted">
          <div className="mb-1.5 font-semibold text-gold">One-time setup (~3 minutes, in your Vercel dashboard)</div>
          <ol className="list-decimal space-y-1 pl-4">
            {missing.includes("store") && (
              <li>
                vercel.com → your <b className="text-text">parlay-lab</b> project → <b className="text-text">Storage</b> tab →
                Browse Marketplace → <b className="text-text">Upstash</b> → <b className="text-text">Redis</b> → Free plan →
                create &amp; connect it to the project (its env vars are added for you).
              </li>
            )}
            {missing.includes("key") && (
              <li>
                Project <b className="text-text">Settings → Environment Variables</b> → add{" "}
                <b className="text-text">LEDGER_SYNC_KEY</b> = a phrase you invent (this is the password for your sync).
              </li>
            )}
            <li>
              <b className="text-text">Deployments</b> tab → ⋯ on the newest deployment → <b className="text-text">Redeploy</b>{" "}
              (new env vars only take effect on a fresh deploy).
            </li>
            <li>Come back here, type that same phrase, and hit Turn on — phone first, then the desktop.</li>
          </ol>
        </div>
      )}
    </Panel>
  );
}

/* Engine v2 data spine health — reads the nightly Statcast priors artifact */
function PriorsStatus() {
  const [p, setP] = useState<null | false | {
    generated_at: string;
    batters: Record<string, unknown>;
    pitchers: Record<string, unknown>;
    parks: { R: Record<string, unknown> };
    league: { xwoba?: number };
  }>(null);
  useEffect(() => {
    fetch("/model/priors.json")
      .then((r) => (r.ok ? r.json() : false))
      .then(setP)
      .catch(() => setP(false));
  }, []);
  if (p === null) return <div className="py-3 text-[12px] text-muted">Checking…</div>;
  if (p === false)
    return <div className="py-3 text-[12px] text-gold">priors.json not published yet — first nightly job pending</div>;
  return (
    <>
      <Row label="Skill priors (Savant xStats + K/BB/whiff/barrel)">
        <span className="num text-[12.5px] text-pos">
          {Object.keys(p.batters).length} batters · {Object.keys(p.pitchers).length} pitchers
        </span>
      </Row>
      <Row label="Park factors (by batter handedness)">
        <span className="num text-[12.5px] text-text">{Object.keys(p.parks.R).length} parks × R/L</span>
      </Row>
      <Row label="Savant percentile ranks (100 = elite, orientation verified)">
        <span className="num text-[12.5px] text-pos">
          {Object.values(p.batters).filter((b) => (b as { pct?: unknown }).pct).length} batters ·{" "}
          {Object.values(p.pitchers).filter((x) => (x as { pct?: unknown }).pct).length} pitchers
        </span>
      </Row>
      <Row label="League xwOBA baseline">
        <span className="num text-[12.5px] text-text">{p.league.xwoba ?? "—"}</span>
      </Row>
      <Row label="Refreshed">
        <span className="num text-[12px] text-muted">
          {new Date(p.generated_at).toLocaleString()} · nightly via GitHub Actions
        </span>
      </Row>
      <ContextStatus />
    </>
  );
}

function ContextStatus() {
  const [c, setC] = useState<null | false | {
    generated_at: string;
    games: unknown[];
    bullpen_last3: Record<string, unknown>;
    ump_db_games: number;
  }>(null);
  useEffect(() => {
    fetch("/model/context.json")
      .then((r) => (r.ok ? r.json() : false))
      .then(setC)
      .catch(() => setC(false));
  }, []);
  if (!c) return <Row label="Daily context (weather · umps · bullpen)"><span className="text-[12px] text-gold">{c === false ? "not published yet" : "checking…"}</span></Row>;
  return (
    <Row label="Daily context (weather · umps · bullpen)">
      <span className="num text-[12.5px] text-text">
        {c.games.length} games · {Object.keys(c.bullpen_last3).length} bullpens · ump db {c.ump_db_games} gm ·{" "}
        {new Date(c.generated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.04] py-3 last:border-0">
      <span className="text-[12.5px] font-medium text-text">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

export default function SettingsPage() {
  const [bankroll, setBankroll] = useState(750);
  const [pass, setPass] = useState("");
  const [quota, setQuota] = useState<string | null>(null);
  const [quotaAt, setQuotaAt] = useState<string | null>(null);
  const [sharpOk, setSharpOk] = useState<null | boolean>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setBankroll(getMoney().bankroll);
    try {
      setPass(localStorage.getItem("pl_pass") ?? "");
      setQuota(localStorage.getItem("pl_quota"));
      const at = localStorage.getItem("pl_quota_at");
      if (at) setQuotaAt(new Date(Number(at)).toLocaleString());
    } catch {
      /* fresh device */
    }
    fetch("/api/sharp", { method: "POST", body: "{}" })
      .then((r) => setSharpOk(r.status !== 501))
      .catch(() => setSharpOk(null));
  }, []);

  const save = () => {
    setMoney({ bankroll });
    try {
      if (pass) localStorage.setItem("pl_pass", pass);
      else localStorage.removeItem("pl_pass");
    } catch {
      /* ignore */
    }
    setSaved("Saved.");
    setTimeout(() => setSaved(""), 2000);
  };

  return (
    <>
      <PageHeader title="Settings" sub="Sizing, ledger sync, device passcode, API status" action={<Pill variant="primary" onClick={save}>Save</Pill>} />
      {saved && <div className="mb-3 text-[12px] text-pos">{saved}</div>}

      <div className="space-y-4">
        <Panel title="Sizing">
          <Row label="Season bankroll">
            <span className="num text-[13px] text-muted">$</span>
            <input
              type="number"
              min={1}
              value={bankroll}
              onChange={(e) => setBankroll(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              className="num w-24 rounded-full border border-line-2 bg-surface-2 px-3 py-1.5 text-[13px] text-text outline-none focus:border-pos/50"
            />
          </Row>
          <Row label="Kelly fraction">
            <span className="num text-[12px] text-muted">¼-Kelly, capped at 2% per bet (engine rule — by design, not editable)</span>
          </Row>
          <Row label="Daily / FUN amounts">
            <span className="text-[12px] text-muted">set on the Builder, frozen once a card locks</span>
          </Row>
        </Panel>

        <SelectionCalibrationPanel />

        <LedgerSyncPanel />

        <Panel title="Device passcode">
          <Row label="Passcode for spend-money actions (The Sharp, forced odds refresh)">
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="not set"
              className="num w-36 rounded-full border border-line-2 bg-surface-2 px-3 py-1.5 text-[13px] text-text outline-none focus:border-gold/60"
            />
          </Row>
          <div className="pt-2 text-[11px] leading-relaxed text-faint">
            Must match the APP_PASSCODE environment variable on Vercel. The public URL is reachable by anyone;
            this stops strangers from burning your API credits. Entered once per device.
          </div>
        </Panel>

        <Panel title="API status">
          <Row label="The Odds API quota remaining">
            <span className="num text-[13px] text-pos">{quota ?? "unknown — generate a board"}</span>
          </Row>
          {quotaAt && (
            <Row label="Quota last read">
              <span className="num text-[12px] text-muted">{quotaAt}</span>
            </Row>
          )}
          <Row label="Odds API key">
            <span className="text-[12px] text-muted">server-side (Vercel env ODDS_API_KEY) — never in this browser</span>
          </Row>
          <Row label="The Sharp (Anthropic)">
            <span className={`text-[12px] font-semibold ${sharpOk == null ? "text-muted" : sharpOk ? "text-pos" : "text-gold"}`}>
              {sharpOk == null ? "checking…" : sharpOk ? "configured on server" : "not configured — add ANTHROPIC_API_KEY in Vercel"}
            </span>
          </Row>
        </Panel>

        <Panel title="Engine v2 — data spine (Statcast priors)">
          <PriorsStatus />
        </Panel>

        <Panel title="Data">
          <Row label="Ledger backup / restore / migration from the old app">
            <span className="text-[12px] text-muted">Ledger tab → Export / Import (locked days are never overwritten)</span>
          </Row>
          <Row label="Book">
            <span className="text-[12px] text-gold">Caesars (Nevada) — the only book the card prices</span>
          </Row>
        </Panel>
      </div>

      <div className="mt-4 text-[10.5px] text-faint">Informational only, not betting advice.</div>
    </>
  );
}
