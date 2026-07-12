"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Pill } from "@/components/ui/Pill";
import { getMoney, setMoney } from "@/lib/engine-client";

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
      <Row label="League xwOBA baseline">
        <span className="num text-[12.5px] text-text">{p.league.xwoba ?? "—"}</span>
      </Row>
      <Row label="Refreshed">
        <span className="num text-[12px] text-muted">
          {new Date(p.generated_at).toLocaleString()} · nightly via GitHub Actions
        </span>
      </Row>
    </>
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
      <PageHeader title="Settings" sub="Sizing, device passcode, API status" action={<Pill variant="primary" onClick={save}>Save</Pill>} />
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
