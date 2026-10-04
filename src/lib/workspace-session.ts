/** Temporary workspace only: never erase ledger, credentials, bankroll or saved settings. */
export const WORKSPACE_KEY = "pl:workspace:v1";
export const CLOSED_TTL = 15 * 60_000;
export type WorkspaceData = { version: 1; updatedAt: number; closedAt: number | null; values: Record<string, unknown> };
// Preserve collection-backed controls and open-ended numeric filters through JSON.
function encode(_key: string, value: unknown): unknown {
  if (value instanceof Set) return { __workspaceType: "Set", value: [...value] };
  if (value instanceof Map) return { __workspaceType: "Map", value: [...value] };
  if (typeof value === "number" && !Number.isFinite(value)) return { __workspaceType: "Number", value: String(value) };
  return value;
}
function decode(_key: string, value: any): unknown {
  if (value?.__workspaceType === "Set" && Array.isArray(value.value)) return new Set(value.value);
  if (value?.__workspaceType === "Map" && Array.isArray(value.value)) return new Map(value.value);
  if (value?.__workspaceType === "Number" && ["Infinity", "-Infinity", "NaN"].includes(value.value)) return Number(value.value);
  return value;
}
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export class WorkspaceSession {
  private data: WorkspaceData;
  readonly restored: boolean;
  constructor(private storage: StorageLike | null, private now = Date.now) {
    let saved: WorkspaceData | null = null;
    try {
      const parsed = JSON.parse(storage?.getItem(WORKSPACE_KEY) ?? "null", decode);
      if (parsed?.version === 1 && Number.isFinite(parsed.updatedAt) && (parsed.closedAt === null || Number.isFinite(parsed.closedAt)) && parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values)) saved = parsed;
    } catch { /* unavailable or corrupt storage starts clean */ }
    const last = saved?.closedAt ?? saved?.updatedAt ?? 0;
    this.restored = !!saved && this.now() >= last && this.now() - last < CLOSED_TTL;
    this.data = this.restored ? saved! : { version: 1, updatedAt: this.now(), closedAt: null, values: {} };
    this.resume();
  }
  read<T>(key: string, initial: () => T): T {
    if (!Object.prototype.hasOwnProperty.call(this.data.values, key)) this.data.values[key] = initial();
    return this.data.values[key] as T;
  }
  write<T>(key: string, value: T) { this.data.values[key] = value; }
  /** Called while the SAME document is alive: background time never expires it. */
  resume() { this.data.closedAt = null; this.flush(); }
  close() { this.data.closedAt = this.now(); this.flush(); }
  flush() {
    this.data.updatedAt = this.now();
    try { this.storage?.setItem(WORKSPACE_KEY, JSON.stringify(this.data, encode)); } catch { /* keep in memory */ }
  }
}
