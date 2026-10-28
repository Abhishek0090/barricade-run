export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);

export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function weighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let roll = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[0][0];
}

/** Stable pseudo-random number in [0, 1) for a pair of integers. Used for scenery that must not flicker. */
export function hash(a: number, b: number) {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
