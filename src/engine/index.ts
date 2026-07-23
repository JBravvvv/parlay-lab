/**
 * The quant engine — the legacy app's script run VERBATIM inside a sandbox of
 * DOM/browser shims (the exact approach the jsc verification harness used for
 * builds 39-44, which proved the engine computes correctly with stubbed DOM).
 * The math is never re-implemented here; this file only provides typed access.
 *
 * Parity with the old app is enforced by tests/parity.test.ts, which runs this
 * module against the captured fixtures and requires a digest identical to
 * tests/fixtures/baseline43.json.
 */
import { LEGACY_SRC } from "./legacy-src.gen";

/** Legacy fetch contract: resolve {ok, body} — never reject. */
export type FetchJson = (url: string) => Promise<{ ok: boolean; body: unknown }>;

export type StorageLike = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

export interface EngineDeps {
  /** All engine network I/O goes through this (odds proxy / statsapi). */
  fetchJson: FetchJson;
  /** Real localStorage in the browser; memory store in tests. */
  storage?: StorageLike;
  /** Test-only: pin the engine's "today" (YYYY-MM-DD). */
  today?: string;
}

/** A pick row as the engine emits it (fields used by the UI; loosely typed on purpose). */
export interface PickRow {
  label: string;
  sub: string;
  odds?: number;
  prob?: number;
  ev?: number | null;
  cz?: { o?: number | null; u?: number | null } | null;
  czOdds?: number | null;
  czEv?: number | null;
  czEdge?: number | null;
  czKellyF?: number | null;
  czBadge?: boolean;
  /* dk_fd: the DK/FD selection basis (better of the pair, tie → DK) */
  bs?: number | null;
  bsOdds?: string | null;
  bsBook?: string | null;
  bsEv?: number | null;
  bsKellyF?: number | null;
  bsBadge?: boolean;
  books?: number;
  lkey?: string;
  conv?: string;
  tags?: string[];
  live?: boolean;
  /* calibration spec additions (all additive) */
  implied?: number;
  edge?: number | null;
  book?: string | null;
  pModel?: number | null;
  wBlend?: number | null;
  lu?: "confirmed" | "projected";
  noParlay?: boolean;
  gkey?: string | null;
  [k: string]: unknown;
}

export interface TicketLeg {
  label: string;
  prop: string;
  odds?: number;
  cz?: number | null;
  bs?: number | null;
  bsBook?: string | null;
  game?: string;
  gkey?: string | null;
  lkey?: string | null;
  est?: number;
  [k: string]: unknown;
}

export interface Ticket {
  name: string;
  type?: string;
  odds?: number;
  prob?: number;
  /* upgrade 02: same-game groups priced from joint sim paths (armed only) */
  simJoint?: boolean;
  probNaive?: number | null;
  ev?: number | null;
  czOdds?: number | null;
  czDec?: number | null;
  czEv?: number | null;
  bsOdds?: string | null;
  bsDec?: number | null;
  bsEv?: number | null;
  /* de-vigged consensus EV% of the whole ticket at the basis price (small-sample gate input) */
  consEv?: number | null;
  posCorr?: boolean;
  negCorr?: boolean;
  legs: TicketLeg[];
  [k: string]: unknown;
}

export interface BoardData {
  overview?: unknown;
  categories: Record<string, PickRow[]>;
  categoriesLive?: Record<string, PickRow[]>;
  parlays: Ticket[];
  parlaysMixed: Ticket[];
  parlaysLive?: Ticket[];
  liveGames?: unknown[];
  trap?: unknown;
  passes?: unknown[];
  gameInfo?: Record<string, { pk: number | null; start: string; away: string; home: string; gm?: number | null }>;
  data_gaps?: string[];
  [k: string]: unknown;
}

export interface Engine {
  /** Read any binding from the legacy scope (functions, SH, SH_CFG, ...). */
  get<T = unknown>(name: string): T;
  /** Overwrite a binding in the legacy scope (e.g. obFetchJson, shToday). */
  set(name: string, value: unknown): void;
  collectSlate(): Promise<unknown>;
  analyze(slate: unknown): BoardData;
}

function elStub(): Record<string, unknown> {
  const e: Record<string, unknown> = {
    style: {},
    value: "",
    innerHTML: "",
    textContent: "",
    checked: false,
    dataset: {},
  };
  e.classList = { toggle() {}, add() {}, remove() {}, contains: () => false };
  for (const m of [
    "addEventListener",
    "removeEventListener",
    "appendChild",
    "append",
    "setAttribute",
    "removeAttribute",
    "focus",
    "blur",
    "remove",
    "insertAdjacentHTML",
    "scrollIntoView",
  ])
    e[m] = () => {};
  e.getAttribute = () => null;
  e.querySelector = () => null;
  e.querySelectorAll = () => [];
  e.closest = () => null;
  e.getBoundingClientRect = () => ({});
  e.cloneNode = () => elStub();
  return e;
}

function memStorage(): StorageLike {
  const s: Record<string, string> = {};
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => {
      s[k] = String(v);
    },
    removeItem: (k) => {
      delete s[k];
    },
  };
}

export function createEngine(deps: EngineDeps): Engine {
  const doc = {
    getElementById: () => elStub(),
    createElement: () => elStub(),
    querySelector: () => elStub(),
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: elStub(),
    documentElement: elStub(),
    head: elStub(),
    cookie: "",
  };
  const win: Record<string, unknown> = {
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
  };
  const shims = {
    localStorage: deps.storage ?? memStorage(),
    document: doc,
    window: win,
    navigator: {
      onLine: true,
      serviceWorker: {
        register: () => Promise.resolve({ update() {}, addEventListener() {} }),
        addEventListener: () => {},
      },
    },
    location: { reload: () => {}, href: "x" },
    history: { replaceState: () => {} },
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    // Legacy init code may touch fetch directly (prompt prefetch etc.); answer
    // with a harmless failed response — all real I/O goes through deps.fetchJson.
    fetch: () =>
      Promise.resolve({
        ok: false,
        status: 0,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
        headers: { get: () => null },
      }),
    __v: undefined as unknown,
  };
  win.self = win;

  // Sloppy-mode evaluation so the ES5 script runs exactly as it does in the
  // browser/jsc; direct eval hoists its declarations into this scope, and the
  // returned get/set closures reach them by name.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const boot = new Function(
    "__shims",
    "__src",
    `var localStorage=__shims.localStorage,document=__shims.document,window=__shims.window,self=__shims.window,
navigator=__shims.navigator,location=__shims.location,history=__shims.history,console=__shims.console,
fetch=__shims.fetch,matchMedia=__shims.window.matchMedia,
addEventListener=function(){},removeEventListener=function(){},scrollTo=function(){},
setTimeout=function(f){return 0;},setInterval=function(){return 0;},clearTimeout=function(){},clearInterval=function(){},
requestAnimationFrame=function(){return 0;},XMLHttpRequest=function(){return {open:function(){},send:function(){},setRequestHeader:function(){}};};
eval(__src);
return {
  get: function(n){ try { return eval(n); } catch(e) { return undefined; } },
  set: function(n, v){ __shims.__v = v; eval(n + " = __shims.__v"); __shims.__v = undefined; }
};`,
  ) as (s: object, src: string) => {
    get: (n: string) => unknown;
    set: (n: string, v: unknown) => void;
  };

  const scope = boot(shims, LEGACY_SRC);

  // Route all engine I/O through the caller's fetcher.
  scope.set("obFetchJson", deps.fetchJson);
  if (deps.today) {
    const t = deps.today;
    scope.set("shToday", () => t);
    scope.set("obSameDay", (iso: unknown) => String(iso).slice(0, 10) === t);
  }

  return {
    get: <T = unknown,>(name: string) => scope.get(name) as T,
    set: (name, value) => scope.set(name, value),
    collectSlate: () => (scope.get("shCollectSlate") as () => Promise<unknown>)(),
    analyze: (slate) => (scope.get("shAnalyzeLocal") as (s: unknown) => BoardData)(slate),
  };
}
