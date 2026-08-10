import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Ordering keys for notebooks and pages.
 *
 * Positions are lexicographically-sortable strings rather than integers, so
 * dragging page 300 to slot 2 rewrites exactly one row. With integer positions
 * the same move is 300 UPDATEs — untenable for notebooks the brief expects to
 * hold hundreds of pages.
 */

/** Key for a new item appended after `last` (pass null for an empty list). */
export function keyAfter(last: string | null): string {
  return generateKeyBetween(last ?? null, null);
}

/** Key for a new item placed before `first`. */
export function keyBefore(first: string | null): string {
  return generateKeyBetween(null, first ?? null);
}

/** Key that sorts strictly between two neighbours. */
export function keyBetween(
  before: string | null,
  after: string | null,
): string {
  return generateKeyBetween(before ?? null, after ?? null);
}

/** `count` evenly spaced keys between two neighbours — used for bulk inserts. */
export function keysBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  return generateNKeysBetween(before ?? null, after ?? null, count);
}

/**
 * Resolve the key for moving an item to `targetIndex` within `ordered`.
 * `ordered` must exclude the item being moved.
 */
export function keyForPosition(
  ordered: { sortIndex: string }[],
  targetIndex: number,
): string {
  const clamped = Math.max(0, Math.min(targetIndex, ordered.length));
  const before = clamped > 0 ? ordered[clamped - 1].sortIndex : null;
  const after = clamped < ordered.length ? ordered[clamped].sortIndex : null;
  return keyBetween(before, after);
}
