import type { GameState } from "./types";
import type { Rng } from "./rng";

// Chip and city IDs for convenience in tests.
export const CHIP_IDS: string[] = [
  "shreds",
  "low-performance-unit",
  "onchip",
  "forgetful-memory",
  "fakeasic",
  "descend",
  "flopster",
  "drainium",
  "fauxfoundry",
  "extinct",
  "ironwoodworm",
  "vera-ruine",
];

export const CITY_IDS: string[] = ["santa-clara", "hsinchu", "mountain-view", "sunnyvale", "seattle", "suwon"];

// Helper to build a Record<string, T> from keys and a value.
export function fill<T>(keys: readonly string[], value: T): Record<string, T> {
  return Object.fromEntries(keys.map((k) => [k, value])) as Record<string, T>;
}

// Set a specific bias for a city/chip pair in the state and return a new state.
export function withBias(
  state: GameState,
  cityId: string,
  chipId: string,
  bias: number
): GameState {
  const newCityBias = {
    ...state.cityBias,
    [cityId]: {
      ...state.cityBias[cityId],
      [chipId]: bias,
    },
  };
  return { ...state, cityBias: newCityBias };
}

// Helper to build a minimal GameState fixture for testing.
// Uses 6 cities, 12 chips, bias=1, modifiers=1.
export function makeState(overrides?: Partial<GameState>): GameState {
  const base: GameState = {
    seed: 42,
    rngState: 12345,
    company: "TestCorp",
    interestEnabled: false,
    day: 1,
    cityIds: CITY_IDS,
    currentCityId: CITY_IDS[0],
    chipIds: CHIP_IDS,
    cash: 10000,
    debt: 2000,
    inventory: fill(CHIP_IDS, 0),
    avgCost: fill(CHIP_IDS, 0),
    dataCenter: 0,
    dataCenterUsed: false,
    uptime: 100,
    tips: [],
    cityBias: Object.fromEntries(
      CITY_IDS.map((city) => [
        city,
        fill(CHIP_IDS, 1) as Record<string, number>,
      ])
    ) as Record<string, Record<string, number>>,
    chipModifier: fill(CHIP_IDS, 1),
    market: {},
    pendingEvent: null,
    pendingRisk: null,
    status: "playing",
    endReason: null,
  };

  return { ...base, ...(overrides ?? {}) };
}

// Fake RNG: next() returns queued values in order, then `fallback`. int/float/pick/chance use the same
// formulas as createRng, so a queued value v forces a known result.
export class FakeRng implements Rng {
  private readonly queue: number[];
  constructor(values: number[], private readonly fallback = 0.5) {
    this.queue = [...values];
  }
  get state(): number {
    return 0;
  }
  get remaining(): number {
    return this.queue.length;
  }
  next(): number {
    return this.queue.length > 0 ? (this.queue.shift() as number) : this.fallback;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }
  sample<T>(items: readonly T[], n: number): T[] {
    return items.slice(0, n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

// Queue value that makes pick()/int(0, length-1) land on `index`.
export const pickValue = (index: number, length: number): number => (index + 0.5) / length;
