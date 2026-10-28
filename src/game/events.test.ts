import { describe, it, expect } from "vitest";
import { createRng, type Rng } from "./rng";
import type { EventKind, GameState } from "./types";
import { rollEvent } from "./events";
import { makeState, CHIP_IDS, fill } from "./testUtils";
import { CONFIG } from "./data/config";
import { getChip } from "./data/chips";

const BAD_KINDS: readonly EventKind[] = ["palletsMissing", "competitorVram", "quantization", "sanctions", "customs"];
const GOOD_KINDS: readonly EventKind[] = ["fellOffTruck", "hypeSpike", "fireSale"];

// Queue that makes rollEvent fire `kind`, followed by that event's own draws.
// holdsChips must match the state: with an empty inventory palletsMissing is not in the bad list.
function badQueue(kind: EventKind, holdsChips: boolean, ...eventValues: number[]): number[] {
  const kinds = holdsChips ? BAD_KINDS : BAD_KINDS.filter((k) => k !== "palletsMissing");
  return [0, pickValue(kinds.indexOf(kind), kinds.length), ...eventValues];
}

function goodQueue(kind: EventKind, ...eventValues: number[]): number[] {
  return [0.99, 0, pickValue(GOOD_KINDS.indexOf(kind), GOOD_KINDS.length), ...eventValues];
}

// Same formula as Rng.float, so expectations match the code's floating-point result exactly.
const floatAt = (min: number, max: number, v: number): number => min + v * (max - min);

// Fake RNG that returns queued values in order
class FakeRng implements Rng {
  private _queue: number[] = [];
  constructor(values: number[], fallback = 0.5) {
    this._queue = [...values];
    this.fallback = fallback;
  }

  fallback: number;

  next(): number {
    if (this._queue.length === 0) {
      return this.fallback;
    }
    const v = this._queue.shift()!;
    return v;
  }

  int(min: number, max: number): number {
    const v = this.next();
    const range = max - min + 1;
    return min + Math.floor(v * range);
  }

  float(min: number, max: number): number {
    const v = this.next();
    return min + v * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    const idx = this.int(0, items.length - 1);
    return items[idx];
  }

  sample<T>(): T[] {
    // Not used in events.ts
    throw new Error("Not implemented");
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  get state(): number {
    return 0;
  }
}

// Helper to build a market with non-zero inventory and uniform defaults
function marketState(overrides?: Partial<GameState>): GameState {
  const base = makeState({
    cash: 10000,
    market: fill(CHIP_IDS, { price: 1000, stock: 50, buyBlocked: false }),
    ...overrides,
  });
  // Ensure each entry is a fresh object
  const newMarket: Record<string, typeof base.market[string]> = {};
  for (const id of CHIP_IDS) {
    newMarket[id] = { ...base.market[id] };
  }
  return { ...base, market: newMarket };
}

// Helper to compute pickValue as specified in the task
const pickValue = (index: number, length: number): number => (index + 0.5) / length;

describe("rollEvent", () => {
  it("returns same state when pending event exists", () => {
    const base = marketState({ pendingEvent: { kind: "customs", good: false, message: "" } });
    const rng = new FakeRng([0.5]);
    const result = rollEvent(base, rng);
    expect(result).toBe(base); // no copy made if already has event
  });

  it("no event when both chances fail", () => {
    const base = marketState();
    const rng = new FakeRng([0.99, 0.99]);
    const result = rollEvent(base, rng);
    expect(result.pendingEvent).toBeNull();
    // Deep equality check
    expect(result.cash).toBe(base.cash);
    expect(result.inventory).toEqual(base.inventory);
    expect(result.market).toEqual(base.market);
  });

  it("handles palletsMissing with inventory", () => {
    const base = marketState({ inventory: fill(CHIP_IDS, 0) });
    // Give only CHIP_IDS[0] (shreds) 10 pallets
    base.inventory[CHIP_IDS[0]] = 10;

    const before = structuredClone(base);
    const lossPct = floatAt(CONFIG.palletLossPctMin, CONFIG.palletLossPctMax, 0.5);
    const held = base.inventory[CHIP_IDS[0]];
    const lost = Math.min(held, Math.max(1, Math.ceil(held * lossPct)));
    // Ensure at least 1 and not more than held
    const finalLost = Math.max(1, Math.min(lost, held));
    const expectedInventory = held - finalLost;

    // bad chance yes (0 < 0.15), pick index 0 of [palletsMissing, ...4 others], loss pct f=0.5 -> lossPct = 0.3
    const rng = new FakeRng(badQueue("palletsMissing", true, 0.5));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("palletsMissing");
    expect(result.pendingEvent?.good).toBe(false);
    expect(result.inventory[CHIP_IDS[0]]).toBe(expectedInventory);
    expect(result.cash).toBe(before.cash);
    expect(result.market).toEqual(before.market);
    expect(result.chipModifier).toEqual(before.chipModifier);

    const chipName = getChip(CHIP_IDS[0]).name;
    expect(result.pendingEvent?.message).toContain(chipName);
    expect(result.pendingEvent?.message).toContain(`${finalLost} pallet(s)`);
  });

  it("handles palletsMissing with empty inventory (falls back to competitorVram)", () => {
    const base = marketState({ inventory: fill(CHIP_IDS, 0) });
    const before = structuredClone(base);

    // bad chance yes (0 < 0.15), pick index 0 of filtered list [competitorVram, quantization, sanctions, customs]
    const rng = new FakeRng(badQueue("competitorVram", false));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("competitorVram");
    expect(result.pendingEvent?.good).toBe(false);
    expect(before).toEqual(base); // input unchanged
  });

  it("handles competitorVram", () => {
    const base = marketState();
    const before = structuredClone(base);

    const chipIndex = 2;
    const f = floatAt(CONFIG.vramModMin, CONFIG.vramModMax, 0.5);
    const expectedPrice = Math.max(1, Math.round(1000 * f));
    const pct = Math.round((1 - f) * 100);

    // bad chance yes (0 < 0.15), pick chip index 2, f=0.45 -> price 450
    const rng = new FakeRng(badQueue("competitorVram", false, pickValue(chipIndex, CHIP_IDS.length), 0.5));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("competitorVram");
    expect(result.pendingEvent?.good).toBe(false);
    expect(result.chipModifier[CHIP_IDS[chipIndex]]).toBeCloseTo(f);
    expect(result.market[CHIP_IDS[chipIndex]].price).toBe(expectedPrice);
    // Others unchanged
    for (const id of CHIP_IDS) {
      if (id !== CHIP_IDS[chipIndex]) {
        expect(result.market[id].price).toBe(before.market[id].price);
        expect(result.chipModifier[id]).toBe(before.chipModifier[id]);
      }
    }

    const chipName = getChip(CHIP_IDS[chipIndex]).name;
    expect(result.pendingEvent?.message).toContain(chipName);
    expect(result.pendingEvent?.message).toContain(`${pct}%`);
  });

  it("handles quantization", () => {
    const base = marketState();
    const before = structuredClone(base);

    const f = floatAt(CONFIG.quantModMin, CONFIG.quantModMax, 0.5);
    const expectedPrice = Math.max(1, Math.round(1000 * f));
    const pct = Math.round((1 - f) * 100);

    // bad chance yes (0 < 0.15), f=0.85 -> price 850
    const rng = new FakeRng(badQueue("quantization", false, 0.5));
    const result = rollEvent(base, rng);
    expect(base).toEqual(before);

    expect(result.pendingEvent?.kind).toBe("quantization");
    expect(result.pendingEvent?.good).toBe(false);
    for (const id of CHIP_IDS) {
      expect(result.chipModifier[id]).toBeCloseTo(f);
      expect(result.market[id].price).toBe(expectedPrice);
    }

    expect(result.pendingEvent?.message).toContain(`All chip prices fell ${pct}%`);
  });

  it("handles sanctions", () => {
    const base = marketState();
    const before = structuredClone(base);

    const chipIndex = 1;
    const finePct = floatAt(CONFIG.finePctMin, CONFIG.finePctMax, 0.5);
    const expectedFine = Math.min(base.cash, Math.ceil(base.cash * finePct));
    const expectedCash = base.cash - expectedFine;

    // bad chance yes (0 < 0.15), pick chip index 1, fine pct f=0.5 -> fine = ceil(10000 * (0.0001 + 0.5*0.0599)) = ceil(3.005) = 4? No: spec says 0.0001+0.5*0.0599 = 0.03005, fine=ceil(300.5)=301
    // Let's compute exactly:
    // finePctMin = 0.0001, finePctMax = 0.06
    // f = 0.5 -> pct = 0.0001 + 0.5 * (0.06 - 0.0001) = 0.0001 + 0.5*0.0599 = 0.03005
    // fine = ceil(10000 * 0.03005) = ceil(300.5) = 301
    const rng = new FakeRng(badQueue("sanctions", true, pickValue(chipIndex, CHIP_IDS.length), 0.5));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("sanctions");
    expect(result.pendingEvent?.good).toBe(false);
    expect(result.market[CHIP_IDS[chipIndex]].buyBlocked).toBe(true);
    expect(result.cash).toBe(expectedCash);
    expect(result.inventory).toEqual(before.inventory);

    const chipName = getChip(CHIP_IDS[chipIndex]).name;
    expect(result.pendingEvent?.message).toContain(chipName);
    expect(result.pendingEvent?.message).toContain(`$${expectedFine}`);
  });

  it("handles sanctions when cash is zero", () => {
    const base = marketState({ cash: 0 });
    const before = structuredClone(base);

    // bad chance yes (0 < 0.15), pick chip index 0, fine pct max
    const rng = new FakeRng(badQueue("sanctions", true, pickValue(0, CHIP_IDS.length), 0.99));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("sanctions");
    expect(result.cash).toBe(0); // fine capped at cash
    expect(before).toEqual(base);
  });

  it("handles sanctions when cash is 1 with max fine pct", () => {
    const base = marketState({ cash: 1 });
    const before = structuredClone(base);

    // bad chance yes (0 < 0.15), pick chip index 0, fine pct max
    const rng = new FakeRng(badQueue("sanctions", true, pickValue(0, CHIP_IDS.length), 0.99));
    const result = rollEvent(base, rng);
    expect(base).toEqual(before);

    expect(result.pendingEvent?.kind).toBe("sanctions");
    // fine = ceil(1 * (0.0001 + 0.99*0.0599)) = ceil(0.0596) = 1
    const finePct = floatAt(CONFIG.finePctMin, CONFIG.finePctMax, 0.99);
    const expectedFine = Math.min(base.cash, Math.ceil(base.cash * finePct));
    expect(result.cash).toBe(base.cash - expectedFine);
  });

  it("handles customs", () => {
    const base = marketState();
    const before = structuredClone(base);

    const finePct = floatAt(CONFIG.finePctMin, CONFIG.finePctMax, 0.5);
    const expectedFine = Math.min(base.cash, Math.ceil(base.cash * finePct));
    const expectedCash = base.cash - expectedFine;

    // bad chance yes (0 < 0.15), fine pct f=0.5 -> fine = ceil(10000 * (0.0001 + 0.5*0.0599)) = 301
    const rng = new FakeRng(badQueue("customs", true, 0.5));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("customs");
    expect(result.pendingEvent?.good).toBe(false);
    expect(result.cash).toBe(expectedCash);
    expect(result.inventory).toEqual(before.inventory);
    expect(result.market).toEqual(before.market);

    expect(result.pendingEvent?.message).toContain(`$${expectedFine}`);
  });

  it("handles customs when cash is zero", () => {
    const base = marketState({ cash: 0 });
    const before = structuredClone(base);

    // bad chance yes (0 < 0.15), fine pct max
    const rng = new FakeRng(badQueue("customs", true, 0.99));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("customs");
    expect(result.cash).toBe(0); // fine capped at cash
    expect(before).toEqual(base);
  });

  it("handles customs when cash is 1 with max fine pct", () => {
    const base = marketState({ cash: 1 });
    const before = structuredClone(base);

    // bad chance yes (0 < 0.15), fine pct max
    const rng = new FakeRng(badQueue("customs", true, 0.99));
    const result = rollEvent(base, rng);
    expect(base).toEqual(before);

    expect(result.pendingEvent?.kind).toBe("customs");
    // fine = ceil(1 * (0.0001 + 0.99*0.0599)) = ceil(0.0596) = 1
    const finePct = floatAt(CONFIG.finePctMin, CONFIG.finePctMax, 0.99);
    const expectedFine = Math.min(base.cash, Math.ceil(base.cash * finePct));
    expect(result.cash).toBe(base.cash - expectedFine);
  });

  it("handles fellOffTruck", () => {
    const base = marketState({ inventory: fill(CHIP_IDS, 0) });
    // Give no pallets initially so we can verify the addition clearly
    for (const id of CHIP_IDS) {
      base.inventory[id] = 0;
    }

    const chipIndex = 3;
    const n = CONFIG.truckMax;

    // good chance yes (0.05 < 0.10), pick chip index 3, n=truckMax (int(1,5) with v=1 -> min + floor(1*5)=1+5=6? No: range is max-min+1 = 5-1+1=5)
    // int(1,5): range=5. want value 5 => idx such that floor(v*5)=4 => v=0.9
    const rng = new FakeRng(goodQueue("fellOffTruck", pickValue(chipIndex, CHIP_IDS.length), 0.9));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("fellOffTruck");
    expect(result.pendingEvent?.good).toBe(true);
    expect(result.inventory[CHIP_IDS[chipIndex]]).toBe(n); // was 0 + 5
    expect(result.cash).toBe(base.cash);

    const chipName = getChip(CHIP_IDS[chipIndex]).name;
    expect(result.pendingEvent?.message).toContain(chipName);
    expect(result.pendingEvent?.message).toContain(`${n} pallet(s)`);
  });

  it("handles hypeSpike", () => {
    const base = marketState();
    const before = structuredClone(base);

    const chipIndex = 4;
    const f = floatAt(CONFIG.hypeMin, CONFIG.hypeMax, 0.5);
    const expectedPrice = Math.max(1, Math.round(1000 * f));

    // good chance yes (0.05 < 0.10), pick chip index 4, f=3 -> price 3000
    // hypeMin=2, hypeMax=4; want f=3 exactly => v such that 2 + v*(4-2)=3 => v*2=1 => v=0.5
    const rng = new FakeRng(goodQueue("hypeSpike", pickValue(chipIndex, CHIP_IDS.length), 0.5));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("hypeSpike");
    expect(result.pendingEvent?.good).toBe(true);
    expect(result.market[CHIP_IDS[chipIndex]].price).toBe(expectedPrice); // 1000 * 3
    expect(result.chipModifier).toEqual(before.chipModifier);

    const chipName = getChip(CHIP_IDS[chipIndex]).name;
    expect(result.pendingEvent?.message).toContain(chipName);
    expect(result.pendingEvent?.message).toContain(`${f.toFixed(1)}x`);
  });

  it("handles fireSale", () => {
    const base = marketState();
    const before = structuredClone(base);

    const chipIndex = 5;
    const f = floatAt(CONFIG.fireSaleMin, CONFIG.fireSaleMax, 0.5);
    const expectedPrice = Math.max(1, Math.round(1000 * f));
    const pct = Math.round(f * 100);

    // good chance yes (0.05 < 0.10), pick chip index 5, f=0.375 -> price 375
    // fireSaleMin=0.25, fireSaleMax=0.5; want f=0.375 => v such that 0.25 + v*(0.5-0.25)=0.375 => v*0.25=0.125 => v=0.5
    const rng = new FakeRng(goodQueue("fireSale", pickValue(chipIndex, CHIP_IDS.length), 0.5));
    const result = rollEvent(base, rng);

    expect(result.pendingEvent?.kind).toBe("fireSale");
    expect(result.pendingEvent?.good).toBe(true);
    expect(result.market[CHIP_IDS[chipIndex]].price).toBe(expectedPrice); // 1000 * 0.375
    expect(result.chipModifier).toEqual(before.chipModifier);

    const chipName = getChip(CHIP_IDS[chipIndex]).name;
    expect(result.pendingEvent?.message).toContain(chipName);
    expect(result.pendingEvent?.message).toContain(`${pct}%`);
  });

  it("does not mutate inputs", () => {
    const base = marketState({ inventory: fill(CHIP_IDS, 0) });
    base.inventory[CHIP_IDS[0]] = 10;
    const before = structuredClone(base);

    // Force palletsMissing
    const rng = new FakeRng(badQueue("palletsMissing", true, 0.5));
    const result = rollEvent(base, rng);

    expect(result).not.toBe(base);
    expect(result.inventory).not.toBe(base.inventory);
    expect(result.market).not.toBe(base.market);
    expect(result.chipModifier).not.toBe(base.chipModifier);

    // Original state unchanged
    expect(before).toEqual(base);
  });

  describe("statistical test", () => {
    it("bad-event share within 0.15 ± 0.01 over many rolls", () => {
      const base = marketState({ inventory: fill(CHIP_IDS, 0) });
      base.inventory[CHIP_IDS[0]] = 10;
      let badCount = 0;
      const trials = 20_000;

      // Single RNG instance across calls
      const rng = createRng(12345);

      for (let i = 0; i < trials; i++) {
        const result = rollEvent(base, rng);
        if (result.pendingEvent !== null && !result.pendingEvent.good) {
          badCount++;
        }
      }

      const rate = badCount / trials;
      expect(rate).toBeGreaterThanOrEqual(0.14);
      expect(rate).toBeLessThanOrEqual(0.16);
    });

    it("good-event share within 0.085 ± 0.01 over many rolls", () => {
      const base = marketState({ inventory: fill(CHIP_IDS, 0) });
      base.inventory[CHIP_IDS[0]] = 10;
      let goodCount = 0;
      const trials = 20_000;

      // Single RNG instance across calls
      const rng = createRng(12345);

      for (let i = 0; i < trials; i++) {
        const result = rollEvent(base, rng);
        if (result.pendingEvent !== null && result.pendingEvent.good) {
          goodCount++;
        }
      }

      const rate = goodCount / trials;
      expect(rate).toBeGreaterThanOrEqual(0.075);
      expect(rate).toBeLessThanOrEqual(0.095);
    });
  });
});
