/** Whole-card taps open coverage; explicit controls keep their own actions.
 * Portal children are deliberately excluded: closing a sheet must not reopen its card.
 */
export function isGameCardBackground(target: EventTarget | null, card: HTMLElement): boolean {
  if (!(target instanceof Element) || !card.contains(target)) return false;
  return !target.closest('button, a, input, select, textarea, summary, [role="button"], [role="link"]');
}
