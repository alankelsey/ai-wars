// Seeded RNG based on mulberry32. State is a single uint32.
// All randomness in the game must flow through this interface.

export interface Rng {
  readonly state: number;            // current uint32 state (read after use to persist)
  next(): number;                    // float in [0, 1)
  int(min: number, max: number): number;    // integer, inclusive both ends; throws RangeError if max < min
  float(min: number, max: number): number;  // [min, max)
  pick<T>(items: readonly T[]): T;          // throws RangeError on empty array
  sample<T>(items: readonly T[], n: number): T[]; // n distinct items, random order; throws if n > length
  chance(p: number): boolean;               // true with probability p
}

// mulberry32: a fast, high-quality PRNG with a 32-bit state
function mulberry32(state: number): number {
  let t = state | 0;
  t = (t + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

export function createRng(state: number): Rng {
  let s = state >>> 0;

  const next = (): number => {
    const val = mulberry32(s);
    s = (s + 0x6D2B79F5) >>> 0; // advance state
    return val;
  };

  const int = (min: number, max: number): number => {
    if (max < min) {
      throw new RangeError(`int range invalid: min=${min}, max=${max}`);
    }
    const range = max - min + 1;
    const r = next();
    return min + Math.floor(r * range);
  };

  const float = (min: number, max: number): number => {
    if (max < min) {
      throw new RangeError(`float range invalid: min=${min}, max=${max}`);
    }
    const r = next();
    return min + r * (max - min);
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError("pick from empty array");
    }
    const idx = int(0, items.length - 1);
    return items[idx];
  };

  const sample = <T>(items: readonly T[], n: number): T[] => {
    if (n < 0) {
      throw new RangeError(`sample n must be non-negative, got ${n}`);
    }
    if (n > items.length) {
      throw new RangeError(`sample n=${n} exceeds array length ${items.length}`);
    }
    // Fisher-Yates shuffle on a copy, then take first n
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, n);
  };

  const chance = (p: number): boolean => {
    if (p < 0 || p > 1) {
      throw new RangeError(`chance probability must be in [0,1], got ${p}`);
    }
    return next() < p;
  };

  return {
    get state(): number { return s; },
    next,
    int,
    float,
    pick,
    sample,
    chance,
  };
}

// FNV-1a 32-bit hash for deterministic seeding from strings
export function seedFromString(s: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
