/**
 * Best stars per level, remembered in this browser. Storage can be missing or
 * throw (private windows, blocked site data), so every access is guarded and
 * the game works the same without it.
 */
const KEY = "packet-tycoon:best-stars";

export type Best = Record<number, number>;

export function loadBest(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): Best {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return {};
    const best: Best = {};
    for (const [id, stars] of Object.entries(parsed)) {
      if (Number.isInteger(stars) && stars >= 0 && stars <= 3) best[Number(id)] = stars;
    }
    return best;
  } catch {
    return {};
  }
}

/** Records a result and returns the updated table. Never lowers a best score. */
export function recordStars(
  best: Best,
  level: number,
  stars: number,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): Best {
  const next = { ...best, [level]: Math.max(best[level] ?? 0, stars) };
  try {
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not saved; the score still shows for this session.
  }
  return next;
}
