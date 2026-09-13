/** Session history stores ticket snapshots, never seeds that could reprice or reshuffle. */
export function moveParlayHistory<T>(from: T[], to: T[], current: T): T | null {
  if (!from.length) return null;
  const previous = from.pop()!;
  to.push(current);
  return previous;
}
