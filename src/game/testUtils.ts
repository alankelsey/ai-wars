import type { GameState } from "./types";

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

export const CITY_IDS: string[] = ["c0", "c1", "c2", "c3", "c4", "c5"];

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
    currentCityId: "c0",
    chipIds: CHIP_IDS,
    cash: 10000,
    debt: 2000,
    inventory: fill(CHIP_IDS, 0),
    cityBias: Object.fromEntries(
      CITY_IDS.map((city) => [
        city,
        fill(CHIP_IDS, 1) as Record<string, number>,
      ])
    ) as Record<string, Record<string, number>>,
    chipModifier: fill(CHIP_IDS, 1),
    market: {},
    pendingEvent: null,
    status: "playing",
  };

  return { ...base, ...(overrides ?? {}) };
}
