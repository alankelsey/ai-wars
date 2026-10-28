import { describe, it, expect } from "vitest";
import { createRng } from "./rng";
import { makeState, CHIP_IDS, CITY_IDS, withBias, fill } from "./testUtils";
import { rollMarket, maxBuy, maxSell } from "./market";

describe("rollMarket", () => {
  it("produces prices within expected bounds for each chip", () => {
    const rng = createRng(999);
    const state = makeState();

    const market = rollMarket(state, rng);

    // Verify all chips are present
    expect(Object.keys(market).length).toBe(CHIP_IDS.length);
    CHIP_IDS.forEach((chipId) => {
      expect(chipId in market).toBe(true);
    });

    // Check prices and stock for each chip
    CHIP_IDS.forEach((chipId) => {
      const entry = market[chipId];
      expect(entry.price).toBeGreaterThanOrEqual(1);
      expect(entry.stock).toBeGreaterThanOrEqual(1);
      expect(entry.stock).toBeLessThanOrEqual(100);
      expect(entry.buyBlocked).toBe(false);
    });
  });

  it("deterministic: same rng state yields same market", () => {
    const rngA = createRng(777);
    const rngB = createRng(777);
    const state = makeState();

    const marketA = rollMarket(state, rngA);
    const marketB = rollMarket(state, rngB);

    expect(marketA).toEqual(marketB);
  });

  it("ensures price never drops below 1 even with tiny modifiers", () => {
    // Use a tiny modifier to force low prices
    const state = makeState({
      cityBias: Object.fromEntries(
        CITY_IDS.map((city) => [
          city,
          city === "c0"
            ? fill(CHIP_IDS, 1)
            : (fill(CHIP_IDS, 1) as Record<string, number>),
        ])
      ) as Record<string, Record<string, number>>,
    });

    const stateWithBias = withBias(state, "c0", "shreds", 0.001);
    const stateWithModifier = {
      ...stateWithBias,
      chipModifier: fill(CHIP_IDS, 1),
    };
    (stateWithModifier.chipModifier as Record<string, number>)["shreds"] = 0.001;

    const rng = createRng(50);
    const market = rollMarket(stateWithModifier, rng);

    // Even with tiny modifiers, price should be at least 1
    expect(market["shreds"].price).toBeGreaterThanOrEqual(1);
  });
});

describe("maxBuy", () => {
  it("returns 0 when status is not playing", () => {
    const state = makeState({ status: "ended" });
    expect(maxBuy(state, "shreds")).toBe(0);
  });

  it("returns 0 when pendingEvent is set", () => {
    const state = makeState({
      pendingEvent: { kind: "fireSale", good: true, message: "" },
    });
    expect(maxBuy(state, "shreds")).toBe(0);
  });

  it("returns 0 if chip not in market", () => {
    const state = makeState({ market: {} });
    expect(maxBuy(state, "nonexistent-chip")).toBe(0);
  });

  it("returns 0 if buyBlocked is true", () => {
    const state = makeState({
      market: { shreds: { price: 10, stock: 5, buyBlocked: true } },
    });
    expect(maxBuy(state, "shreds")).toBe(0);
  });

  it("limits by available cash (floor division)", () => {
    const state = makeState({
      cash: 97,
      market: { shreds: { price: 10, stock: 20, buyBlocked: false } },
    });
    expect(maxBuy(state, "shreds")).toBe(9); // floor(97 / 10)
  });

  it("limits by available stock", () => {
    const state = makeState({
      cash: 500,
      market: { shreds: { price: 10, stock: 3, buyBlocked: false } },
    });
    expect(maxBuy(state, "shreds")).toBe(3);
  });

  it("returns the minimum of cash and stock limits", () => {
    const state = makeState({
      cash: 25,
      market: { shreds: { price: 10, stock: 10, buyBlocked: false } },
    });
    expect(maxBuy(state, "shreds")).toBe(2);
  });

  it("works correctly when cash is zero", () => {
    const state = makeState({
      cash: 0,
      market: { shreds: { price: 10, stock: 5, buyBlocked: false } },
    });
    expect(maxBuy(state, "shreds")).toBe(0);
  });
});

describe("maxSell", () => {
  it("returns 0 when status is not playing", () => {
    const state = makeState({ status: "ended" });
    expect(maxSell(state, "shreds")).toBe(0);
  });

  it("returns 0 when pendingEvent is set", () => {
    const state = makeState({
      pendingEvent: { kind: "fireSale", good: true, message: "" },
    });
    expect(maxSell(state, "shreds")).toBe(0);
  });

  it("returns inventory count for held chips", () => {
    const state = makeState({
      inventory: fill(CHIP_IDS, 0),
    });
    (state.inventory as Record<string, number>)["shreds"] = 7;
    expect(maxSell(state, "shreds")).toBe(7);
  });

  it("returns 0 for chips not in inventory", () => {
    const state = makeState({ inventory: fill(CHIP_IDS, 0) });
    expect(maxSell(state, "shreds")).toBe(0);
  });

  it("handles zero inventory correctly", () => {
    const state = makeState({
      inventory: fill(CHIP_IDS, 0),
    });
    (state.inventory as Record<string, number>)["shreds"] = 0;
    expect(maxSell(state, "shreds")).toBe(0);
  });
});
