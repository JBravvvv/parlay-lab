"use client";
import { useRegenerateBoard } from "@/lib/useBoard";
import { getSyncKey } from "@/lib/ledgerSync";
import { refillReason, refillRepricedBoard, useRefillDesk } from "@/lib/refill-client";
import { GEN_CREDITS_EST, generatesToday } from "@/lib/engine-client";
import { serverRepricesToday, useLiveBoardReprice } from "@/lib/mlb/live-board-client";

/** Board and Parlay Builder share the same refill, full re-price, and browser fallback. */
export function useMlbBoardRefresh(d: unknown) {
  const regen = useRegenerateBoard();
  const refill = useRefillDesk();
  const liveBoard = useLiveBoardReprice({ onFallback: () => regen.mutate() });
  const refresh = () => {
    if (!(d && getSyncKey())) {
      regen.mutate();
      return;
    }
    refill.mutate("mlb", {
      /* INSTRUCTION 50 item 1 (2026-09-11). The 49 fix only fell back to a browser
         re-price when the server refused with ONE of two reasons — and the refill
         pass is slot-gated and attempt-capped, so most taps were refused free under
         one of the other seven reasons and NOTHING re-priced. Worse, refillDesk
         resolves 401 / 502 / 503 as a mutation SUCCESS carrying no `fired` field at
         all, so a failing server also did nothing. A tap must never resolve with
         nothing re-priced: fall back on ANY refusal, ANY non-2xx, and on a throw. */
      onSuccess: (r) => {
        const refused = r.body.fired === false;
        const httpFail = r.status < 200 || r.status > 299;
        /* 2026-09-12: WITH A GAME UNDER WAY THE SERVER GOES FIRST. A browser re-price
           builds a board in this tab and never stores it, so the STORED board — the one
           every other device, the stamped picks and tomorrow's grading read — stayed
           frozen at its pre-kick state on exactly the slate Josh is watching. The
           board-only pass stores it and cannot touch the locked card. Pregame, the line
           below is reached unchanged.

           GATED ON `liveGap.live`, NOT `pregameLive` (review round, 2026-09-12).
           `pregameLive` additionally requires `board.at <= start` — "is this row's price
           older than its game" — which is a different question and one this very pass
           destroys: the board it stores is newer than every first pitch, so the second
           tap of the evening would have found `pregameLive === 0` and silently gone back
           to the browser-only path for the rest of the night. On an all-early slate it
           would never have fired at all. `liveGap.live` is the count the live poll
           actually reports as in progress, whatever the board's age. */
        /* JOSH, 2026-09-19 (verbatim): "MLB should also do a FULL refresh every single time i refresh."
           The gate above (a game under way, the 45-minute limiter, the four-run cap) is gone: EVERY tap
           now ends with the whole board re-priced and STORED on the server. When the refill's own pass
           already did that — it fired a top-up generate that ran (refillRepricedBoard) — the tap is done;
           on ANY other answer (refused, skipped, failed, non-2xx) the forced board-only pass
           (live=1&force=1: outside the limiter and the cap, tallied on its own key, never touching the
           card) buys it. The browser-only re-price is now the fallback of that fallback (liveBoard's
           onFallback), so a tap still never resolves with nothing re-priced. */
        if (!httpFail && !refused && refillRepricedBoard(r.body)) return;
        liveBoard.mutate();
      },
      onError: () => liveBoard.mutate(),
    });
  };

  /* INSTRUCTION 50 item 1: EVERY tap prints a line. A plain success used to print nothing at all —
     which is precisely what "the refresh button doesn't work" looks like from the outside. The
     spend is shown too: generatesToday() × GEN_CREDITS_EST. That counter exists to make the spend
     VISIBLE, never to block it (src/lib/engine-client.ts) — there is deliberately no cooldown here,
     because nothing in this app may stop a bet. */
  const spendNote = (() => {
    const n = generatesToday();
    /* BOTH HALVES OF THE BILL (review round, 2026-09-12). The server's board-only pass costs the
       same full generate as the browser one, and showing only the browser count made the more
       expensive half invisible — a night could read "1 browser re-price today" with six server
       generates bought behind it. Both are counted for visibility only; neither blocks a tap. */
    const s = serverRepricesToday();
    const browser = n > 0 ? ` · ${n} browser re-price${n === 1 ? "" : "s"} today ≈ ${n * GEN_CREDITS_EST} Odds credits (counted, never blocked)` : "";
    const server = s > 0 ? ` · ${s} server board re-price${s === 1 ? "" : "s"} today ≈ ${s * GEN_CREDITS_EST} Odds credits (counted, never blocked)` : "";
    return `${browser}${server}`;
  })();
  /* WHAT THE SERVER'S BOARD-ONLY PASS DID, in plain English, appended to whatever the refill said
     (2026-09-12). A refused refill resolves rather than throwing, so `refill.data` is set on exactly
     the taps that go on to the board-only pass — reporting the refusal and saying nothing about what
     was done instead is how a refresh ends up looking like it did nothing. Since 2026-09-19 the pass
     is FORCED on every tap (Josh: "a FULL refresh every single time i refresh"), so the limiter's
     pacing answer no longer exists: a failure here is a real one and is named. */
  const liveBoardNote = liveBoard.isPending
    ? " · the server is re-pricing the full board and the games in play…"
    : liveBoard.isSuccess
      ? " · full board re-priced and stored on the server — your locked card was not touched"
      : liveBoard.isError
        ? ` · the server did not re-price the board: ${liveBoard.error.message}`
        : "";
  const refreshNote =
    refill.isPending || regen.isPending || liveBoard.isPending
      ? liveBoard.isPending
        ? "refreshing — the server is re-pricing the full board and the games in play (your locked card is not touched)…"
        : regen.isPending
          ? "refreshing — re-pricing the board on this device…"
          : "refreshing — asking the server for a refill, then a full stored re-price of the board…"
      : refill.error
        ? /* THE FALLBACK'S ACTUAL OUTCOME, NOT AN ASSERTION (INSTRUCTION 50 fix pass). This
             branch used to say "re-priced in the browser instead" unconditionally — but the
             offline case trips exactly here: the refill fetch throws, onError fires
             regen.mutate(), that fails too, and Josh was told the board had been re-priced on
             his device when nothing was. A refresh may never report an action it did not take. */
          regen.isError
          ? `refill failed: ${refill.error.message}, and the browser re-price also failed: ${regen.error?.message ?? "the odds feed didn't answer"} — nothing was re-priced and nothing was fabricated${spendNote}`
          : regen.isSuccess
            ? `refill failed: ${refill.error.message} — re-priced in the browser instead${spendNote}`
            : liveBoard.isSuccess
              ? `refill failed: ${refill.error.message} — full board re-priced and stored on the server instead${spendNote}`
              : `refill failed: ${refill.error.message} — re-pricing in the browser…`
        : regen.isError
          ? `re-price failed: ${regen.error?.message ?? "the odds feed didn't answer"} — nothing was fabricated${spendNote}`
          : refill.data
            ? `${refillReason(refill.data.body) ?? (refill.data.body.fired === true ? "refilled — the server ran its own full pass, board re-priced and stored" : "the server had nothing to add")}${liveBoardNote}${
                regen.isSuccess ? " · board re-priced on this device" : ""
              }${spendNote}`
            : liveBoard.isSuccess
              ? `full board re-priced and stored on the server — your locked card was not touched${spendNote}`
              : liveBoard.isError
                ? `the server did not re-price the board: ${liveBoard.error.message}${regen.isSuccess ? " · board re-priced on this device instead" : ""}${spendNote}`
                : regen.isSuccess
                  ? `board re-priced on this device${spendNote}`
                  : null;

  return { regen, refill, liveBoard, refresh, refreshNote,
    isRefreshing: regen.isPending || refill.isPending || liveBoard.isPending };
}
