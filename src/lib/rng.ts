export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(1000 + Math.random() * 900000);
}

export function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickWeighted<T>(entries: readonly (readonly [T, number])[], rng: () => number): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const roll = rng() * total;
  let cumulative = 0;
  for (const [value, weight] of entries) {
    cumulative += weight;
    if (roll < cumulative) return value;
  }
  return entries[entries.length - 1][0];
}
