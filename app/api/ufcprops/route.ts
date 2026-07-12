import { NextResponse } from "next/server";

/**
 * UFC prop odds, including the Caesars column, scraped from BestFightOdds'
 * public event page (the odds feed carries no MMA props at any book — verified
 * against the API). Host is hardcoded; nothing user-supplied is fetched.
 * Best-effort by nature: if BFO changes markup or blocks us, this returns 502
 * and the Builder's typed-price props desk still works.
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TTL = 240;

/* books worth comparing (skip prediction markets + unlabeled columns) */
const REAL_BOOKS = new Set(["FanDuel", "Caesars", "BetRivers", "BetWay", "BetMGM", "DraftKings"]);

const imp = (a: number) => (a > 0 ? 100 / (a + 100) : Math.abs(a) / (Math.abs(a) + 100));
const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

type Prop = { label: string; cz: number; bestBook: string | null; bestOdds: number | null; medImplied: number; books: number };
type Fight = { a: string; b: string; czMlA: number | null; czMlB: number | null; props: Prop[] };

async function get(url: string) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, next: { revalidate: TTL } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.text();
}

export async function GET() {
  try {
    const home = await get("https://www.bestfightodds.com/");
    const ev = home.match(/href="(\/events\/ufc-[^"]+)"/)?.[1];
    if (!ev) return NextResponse.json({ error: "no UFC event found" }, { status: 502 });
    const page = await get("https://www.bestfightodds.com" + ev);

    const bookByCol: Record<string, string> = {};
    for (const m of page.matchAll(/<th scope="col" data-b="(\d+)"><a[^>]*>([^<]+)<\/a>/g)) bookByCol[m[1]] = m[2];

    type WipFight = Fight & { half?: boolean };
    const fights: WipFight[] = [];
    let cur: WipFight | null = null;
    for (const rm of page.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)) {
      const row = rm[1];
      if (!row.includes("data-li")) continue;
      const th = row.match(/<th scope="row"[^>]*>(.*?)<\/th>/s);
      if (!th) continue;
      const label = th[1].replace(/<[^>]+>/g, "").replace(/^\d{4,6}/, "").trim();
      if (!label) continue;
      const cells: Record<string, number> = {};
      for (const c of row.matchAll(/data-li="\[(\d+),[^\]]*\]">\s*<span[^>]*>([+\-]?\d+)<\/span>/g)) {
        const book = bookByCol[c[1]];
        if (book) cells[book] = Number(c[2]);
      }
      if (row.includes("/fighters/")) {
        if (cur?.half) {
          cur.b = label;
          cur.czMlB = cells["Caesars"] ?? null;
          cur.half = false;
        } else {
          cur = { a: label, b: "", czMlA: cells["Caesars"] ?? null, czMlB: null, props: [], half: true };
          fights.push(cur);
        }
      } else if (cur && cells["Caesars"] != null) {
        const cz = cells["Caesars"];
        const others = Object.entries(cells).filter(([b]) => REAL_BOOKS.has(b) && b !== "Caesars");
        if (!others.length) continue;
        const imps = others.map(([, v]) => imp(v)).sort((x, y) => x - y);
        const mid = Math.floor(imps.length / 2);
        const med = imps.length % 2 ? imps[mid] : (imps[mid - 1] + imps[mid]) / 2;
        const [bestBook, bestOdds] = others.reduce((acc, kv) => (dec(kv[1]) > dec(acc[1]) ? kv : acc));
        cur.props.push({ label, cz, bestBook, bestOdds, medImplied: med, books: others.length });
      }
    }

    return NextResponse.json({
      source: "bestfightodds.com" + ev,
      at: Date.now(),
      fights: fights.filter((f) => f.b && f.props.length).map(({ half: _h, ...f }) => f),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
