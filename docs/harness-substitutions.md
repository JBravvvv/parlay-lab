# Harness substitutions — what the test sandbox replaces (2026-07-25)

## Why this file exists

339 tests passed, the parity digest was byte-identical, and a **24% hole in every
server board survived for a week**. Not because a test was missing — because
`createEngine` **replaced the function that had the bug**. Whenever `today` is pinned
the harness swaps `obSameDay` for a UTC-string comparison, so the suite exercised
neither production behaviour nor the browser's. It simulated the bug and called it
green.

A substitution is not a mock detail. It is a **region of production behaviour the suite
structurally cannot see**. This file names every one of them, and
`tests/harness-manifest.test.ts` fails the build if a substitution is added without an
entry here.

## The rule

1. **Every substitution is listed below**, with what it diverges from and what could
   hide behind it. Enforced by test.
2. **Time- and timezone-dependent behaviour is tested at BOTH `TZ=UTC` and
   `TZ=America/Los_Angeles`, never patched out.** The server runs UTC and the phone
   runs Pacific; any function whose output depends on the host calendar day must be
   proven identical in both. Pattern: `tests/timezone-parity.test.ts`.
3. A substitution that exists only to pin determinism (a frozen clock, a seeded RNG)
   is fine. A substitution that **changes a decision rule** — what gets filtered, what
   counts as today — is a defect generator and needs a paired both-TZ test.

## Behavioural substitutions — these change engine decisions

| substitution | when | diverges from production by | what can hide behind it |
|---|---|---|---|
| `obFetchJson` → `deps.fetchJson` | always | no real HTTP: no headers, quota, retries, redirects, or error shapes | wrong URL construction (the fixture router matches on substrings, so a malformed query can still route); quota/429 handling; partial-response handling |
| `shToday` → `() => today` | only when `today` is pinned | production derives the date from the **host local clock** | every TZ-dependent date decision — the server's day and the phone's day are not the same day for ~7 hours of every 24 |
| `obSameDay` → `iso.slice(0,10) === today` | only when `today` is pinned | production compares **host-local calendar dates** | **PROVEN: the 24% slate hole.** Fixed 2026-07-25 by removing `obSameDay` from the engine path entirely; the substitution remains for other pinned-date tests |

## Environment shims — these change what the engine can observe

| shim | production | what can hide behind it |
|---|---|---|
| `console.{log,warn,error,info}` → no-ops | real console | **every diagnostic the engine emits.** A warning that should be loud is silent in tests and in the sandbox generally |
| `setTimeout` / `setInterval` → return 0, never fire | real timers | any retry, debounce, backoff or polling path — callbacks are never invoked, so timer-driven code is untested by construction |
| `clearTimeout` / `clearInterval` → no-ops | real | mismatched clear logic |
| `requestAnimationFrame` → returns 0, never fires | real rAF | animation/measurement paths (not used by the engine) |
| `fetch` → always `{ok:false, status:0}` | real fetch | any code that bypasses `obFetchJson` and calls `fetch` directly — it always sees failure, so its success branch is never exercised |
| `XMLHttpRequest` → inert stub | real XHR | legacy XHR paths |
| `localStorage` → in-memory (or the caller's) | real storage | quota exhaustion, cross-tab writes, persistence across reloads |
| `document`, `window`, `head`, `body` → element stubs | real DOM | all rendering. Low risk: the engine is compute-only, which is what builds 39–44 proved |
| `navigator.onLine` → always `true` | real | offline branches |
| `matchMedia` → `{matches:false}` | real | media-query branches |
| `location.reload`, `history.replaceState` → no-ops | real | reload/navigation side effects |
| `addEventListener` / `removeEventListener` → no-ops | real listeners | every event-driven path: visibility changes, online/offline, storage events, pageshow. Nothing the engine registers is ever fired |
| `scrollTo` → no-op | real | scroll side effects (UI only) |

## NOT substituted (and must stay that way)

- **`Date`** — the host clock and host timezone are real. This is what makes
  `tests/timezone-parity.test.ts` possible at all. Pinning it globally would recreate
  exactly the blindness that hid the 24% hole.
- **`Math.random`** — the engine seeds its own RNG (`shMulberry`), so determinism
  comes from the algorithm rather than from a patch.

## `obSameDay` after the fix

The engine no longer calls it. Its two remaining callers are **legacy-UI only** and are
never reached through the `collectSlate` / `analyze` facade the Next app uses:

- `gTime` (L912) — display helper: shows a time for today, a date otherwise.
- `obLoadGames` (L924) — the legacy odds-board tab.

Both are dead code in the Next app and retire with `legacy/` at cutover. They are named
here so a future reader doesn't find a timezone-sensitive function still in the file and
assume the defect is still live.
