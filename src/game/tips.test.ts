import { describe, it, expect } from "vitest";
import type { GameState, MarketEntry } from "./types";
import { rollTips } from "./tips";
import { CONFIG } from "./data/config";
import { CHEAP_TIPS, PREMIUM_TIPS } from "./data/tips";
import { getChip } from "./data/chips";
import { getCity } from "./data/cities";
import { makeState, CHIP_IDS, FakeRng, pickValue } from "./testUtils";

const CITY = "hsinchu";

function pricedState(): GameState {
  const market: Record<string, MarketEntry> = Object.fromEntries(
    CHIP_IDS.map((id) => [id, { price: 1000, stock: 50, buyBlocked: false }])
  );
  return makeState({ cityIds: [CITY, "seattle"], currentCityId: CITY, market });
}

const floatAt = (min: number, max: number, v: number): number => min + v * (max - min);

describe("rollTips", () => {
  it("clears tips and leaves the market alone when the chance roll fails", () => {
    const s = { ...pricedState(), tips: [{ chipId: CHIP_IDS[0], cheap: true, message: "old" }] };
    const rng = new FakeRng([CONFIG.tipChance]); // not < tipChance
    const after = rollTips(s, rng);
    expect(after.tips).toEqual([]);
    expect(after.market).toEqual(s.market);
    expect(rng.remaining).toBe(0);
  });

  it("makes a cheap tip: picks chip, cheap, factor, template in that order", () => {
    const s = pricedState();
    const chipIndex = 3;
    const rng = new FakeRng([0, pickValue(chipIndex, CHIP_IDS.length), 0, 0.5, pickValue(1, CHEAP_TIPS.length)]);
    const after = rollTips(s, rng);
    const chipId = CHIP_IDS[chipIndex];
    const name = getChip(chipId).name;
    const expectedPrice = Math.max(1, Math.round(1000 * floatAt(CONFIG.tipCheapMin, CONFIG.tipCheapMax, 0.5)));
    expect(after.market[chipId].price).toBe(expectedPrice);
    expect(after.tips).toEqual([
      {
        chipId,
        cheap: true,
        message: CHEAP_TIPS[1].replaceAll("{chip}", name).replaceAll("{city}", getCity(CITY).shortName),
      },
    ]);
    expect(rng.remaining).toBe(0);
  });

  it("makes a premium tip and fills both placeholders", () => {
    const s = pricedState();
    const rng = new FakeRng([0, pickValue(0, CHIP_IDS.length), 0.99, 0.25, pickValue(0, PREMIUM_TIPS.length)]);
    const after = rollTips(s, rng);
    const chipId = CHIP_IDS[0];
    expect(after.market[chipId].price).toBe(Math.round(1000 * floatAt(CONFIG.tipPremiumMin, CONFIG.tipPremiumMax, 0.25)));
    expect(after.tips[0].cheap).toBe(false);
    expect(after.tips[0].message).toBe(
      `Everyone in Hsinchu is training a frontier model — ${getChip(chipId).name} is selling at premium prices!`
    );
  });

  it("only changes the tipped chip and never mutates the input", () => {
    const s = pricedState();
    const snapshot = structuredClone(s);
    const after = rollTips(s, new FakeRng([0, pickValue(2, CHIP_IDS.length), 0, 0, 0]));
    expect(s).toEqual(snapshot);
    CHIP_IDS.filter((id) => id !== CHIP_IDS[2]).forEach((id) => expect(after.market[id]).toEqual(s.market[id]));
  });

  it("never drops a price below $1", () => {
    const base = pricedState();
    const s = { ...base, market: { ...base.market, [CHIP_IDS[0]]: { price: 1, stock: 5, buyBlocked: false } } };
    const after = rollTips(s, new FakeRng([0, pickValue(0, CHIP_IDS.length), 0, 0, 0]));
    expect(after.market[CHIP_IDS[0]].price).toBe(1);
  });
});
