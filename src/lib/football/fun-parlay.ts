type Choice<T> = { row: T; dec: number; prob: number };
type Rules = { legs: { min: number; max: number }; minDec: number; maxDec: number };

/** Bounded search across distinct games; retain candidates in different payout bands. */
export function chooseFunRows<T extends { gameId: string }>(choices: readonly Choice<T>[], rules: Rules): T[] {
  const games = new Map<string, Choice<T>[]>();
  const probabilities = new Map<T, number>();
  for (const choice of choices) {
    if (!(choice.dec > 1 && choice.dec <= rules.maxDec && choice.prob > 0 && choice.prob <= 1)) continue;
    const group = games.get(choice.row.gameId) ?? [];
    group.push(choice);
    games.set(choice.row.gameId, group);
    probabilities.set(choice.row, choice.prob);
  }
  type State = { rows: T[]; dec: number; prob: number };
  let states: State[] = [{ rows: [], dec: 1, prob: 1 }];
  for (const group of games.values()) {
    const bands = new Map<string, State[]>();
    const admit = (candidate: State) => {
      const band = Math.floor(Math.log(candidate.dec) / Math.log(rules.maxDec) * 120);
      // Keep candidates on either side of the minimum separate: a stronger short ticket
      // must not evict the only qualifying ticket in its adjacent payout band.
      const key = `${candidate.rows.length}:${candidate.dec >= rules.minDec}:${band}`;
      const bucket = bands.get(key) ?? [];
      bucket.push(candidate);
      bucket.sort((a, b) => b.prob - a.prob || b.dec - a.dec);
      if (bucket.length > 2) bucket.length = 2;
      bands.set(key, bucket);
    };
    for (const state of states) {
      admit(state);
      if (state.rows.length >= rules.legs.max) continue;
      for (const choice of group) {
        if (state.dec * choice.dec <= rules.maxDec) {
          admit({ rows: [...state.rows, choice.row], dec: state.dec * choice.dec, prob: state.prob * choice.prob });
        }
      }
    }
    states = [...bands.values()].flat();
  }
  const winner = states
    .filter(s => s.rows.length >= rules.legs.min && s.dec >= rules.minDec && s.dec <= rules.maxDec)
    .sort((a, b) => b.prob - a.prob || b.prob * b.dec - a.prob * a.dec)[0];
  return winner?.rows.sort((a, b) => probabilities.get(b)! - probabilities.get(a)!) ?? [];
}
