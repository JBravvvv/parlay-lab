import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

const mocks = vi.hoisted(() => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false,
    error: null as Error | null, data: undefined as { status: number; body: Record<string, unknown> } | undefined });
  return { regen: mutation(), refill: mutation(), liveBoard: mutation(), sync: vi.fn(), liveOptions: vi.fn() };
});
vi.mock("@/lib/useBoard", () => ({ useRegenerateBoard: () => mocks.regen }));
vi.mock("@/lib/ledgerSync", () => ({ getSyncKey: mocks.sync }));
vi.mock("@/lib/engine-client", () => ({ GEN_CREDITS_EST: 172, generatesToday: () => 0 }));
vi.mock("@/lib/refill-client", async (original) => ({
  ...await original<typeof import("@/lib/refill-client")>(), useRefillDesk: () => mocks.refill,
}));
vi.mock("@/lib/mlb/live-board-client", () => ({
  serverRepricesToday: () => 0,
  useLiveBoardReprice: (options: unknown) => { mocks.liveOptions(options); return mocks.liveBoard; },
}));
import { useMlbBoardRefresh } from "@/lib/mlb/use-board-refresh";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sync.mockReturnValue("synthetic-test-key");
  for (const mutation of [mocks.regen, mocks.refill, mocks.liveBoard]) {
    mutation.isPending = false; mutation.isSuccess = false; mutation.isError = false;
    mutation.error = null; mutation.data = undefined;
  }
});

// Dependencies are mocked hooks; exercise the real shared callback without a network/ledger write.
describe("Board and Parlay Builder refresh", () => {
  it.each([undefined, null])("generates locally when no board is loaded (%s)", (board) => {
    useMlbBoardRefresh(board).refresh();
    expect(mocks.regen.mutate).toHaveBeenCalledOnce();
    expect(mocks.refill.mutate).not.toHaveBeenCalled();
  });
  it("uses the existing device generate when no sync phrase is stored", () => {
    mocks.sync.mockReturnValue(null);
    useMlbBoardRefresh({}).refresh();
    expect(mocks.regen.mutate).toHaveBeenCalledOnce();
    expect(mocks.refill.mutate).not.toHaveBeenCalled();
  });
  it("does not buy a second re-price when refill already stored the refreshed board", () => {
    useMlbBoardRefresh({}).refresh();
    expect(mocks.refill.mutate.mock.calls[0][0]).toBe("mlb");
    mocks.refill.mutate.mock.calls[0][1].onSuccess({status: 200, body: { fired: true, generateStatus: 200, generate: { ok: true } }});
    expect(mocks.liveBoard.mutate).not.toHaveBeenCalled();
    expect(mocks.regen.mutate).not.toHaveBeenCalled();
  });
  it.each([
    {status: 200, body: {fired: false}},
    {status: 401, body: {error: "unauthorized"}},
    {status: 503, body: {fired: true, generate: {ok: true}}},
    {status: 200, body: {fired: true, generate: {ok: true, skipped: "no odds"}}},
    {status: 200, body: {fired: true, generateStatus: 502, generate: {ok: true}}},
    {status: 200, body: {}},
  ])("forces a server re-price when refill cannot re-price: %j", (answer) => {
    useMlbBoardRefresh({}).refresh();
    mocks.refill.mutate.mock.calls[0][1].onSuccess(answer);
    expect(mocks.liveBoard.mutate).toHaveBeenCalledOnce();
    expect(mocks.regen.mutate).not.toHaveBeenCalled();
  });
  it("tries the server after a thrown refill and retains the browser fallback if that fails", () => {
    useMlbBoardRefresh({}).refresh();
    mocks.refill.mutate.mock.calls[0][1].onError(new Error("offline"));
    expect(mocks.liveBoard.mutate).toHaveBeenCalledOnce();
    mocks.liveOptions.mock.calls[0][0].onFallback();
    expect(mocks.regen.mutate).toHaveBeenCalledOnce();
  });
  it.each(["regen", "refill", "liveBoard"] as const)("shows progress throughout %s", (step) => {
    mocks[step].isPending = true;
    const result = useMlbBoardRefresh({});
    expect(result.isRefreshing).toBe(true);
    expect(result.refreshNote).toContain("refreshing");
  });
  it("reports a failed fallback honestly", () => {
    mocks.refill.error = new Error("refill offline");
    mocks.regen.isError = true; mocks.regen.error = new Error("odds offline");
    expect(useMlbBoardRefresh({}).refreshNote).toContain("nothing was re-priced");
  });
  it("mounts the existing football controls and shared MLB refresh at the top of Parlay Builder", () => {
    const props = fs.readFileSync("app/props/page.tsx", "utf8");
    const board = fs.readFileSync("app/board/page.tsx", "utf8");
    expect(props).toContain('action={<CfbRefreshPill label="Refresh Board" />}');
    expect(props).toContain('action={<NflRefreshPill label="Refresh Board" />}');
    expect(props).toContain('useMlbBoardRefresh(q.data?.data)');
    expect(board).toContain('useMlbBoardRefresh(board?.data)');
    expect(props).toContain('onClick={refresh} disabled={q.isPending || isRefreshing}');
    expect(props.indexOf('onClick={refresh}')).toBeLessThan(props.indexOf('<GenSheet'));
  });
});
