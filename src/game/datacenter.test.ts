import { describe, it, expect } from "vitest";
import type { GameEvent, GameState, UptimeRisk } from "./types";
import { canUseDataCenter, deposit, withdraw, depositChips, withdrawChips } from "./datacenter";
import { makeState, CHIP_IDS, FakeRng, fill, pickValue } from "./testUtils";
import { newGame, buy, sell } from "./game";
import { rollEvent } from "./events";
import { maxSell } from "./market";
import { COMPANIES } from "./data/companies";
import { getDifficulty } from "./data/difficulty";

describe("canUseDataCenter", () => {
  const base = makeState({ cash: 1000, dataCenter: 500 });

  it("returns true when conditions are met", () => {
    expect(canUseDataCenter(base)).toBe(true);
  });

  it("returns false if status is not playing", () => {
    expect(canUseDataCenter({ ...base, status: "ended" as const })).toBe(false);
  });

  it("returns false if pendingEvent is set", () => {
    const EVENT: GameEvent = { kind: "customs", good: false, message: "x" };
    expect(canUseDataCenter({ ...base, pendingEvent: EVENT })).toBe(false);
  });

  it("returns false if pendingRisk is set", () => {
    const RISK: UptimeRisk = {
      kind: "ransomware",
      message: "x",
      downtime: 20,
      attempts: 0,
      outcome: "pending",
    };
    expect(canUseDataCenter({ ...base, pendingRisk: RISK })).toBe(false);
  });

  it("returns false if dataCenterUsed is true", () => {
    expect(canUseDataCenter({ ...base, dataCenterUsed: true })).toBe(false);
  });
});

describe("deposit", () => {
  const base = makeState({ cash: 1000, dataCenter: 500 });

  it("moves cash to dataCenter and sets dataCenterUsed", () => {
    const result = deposit(base, 300);
    expect(result.cash).toBe(700);
    expect(result.dataCenter).toBe(800);
    expect(result.dataCenterUsed).toBe(true);
    expect(result).not.toBe(base);
  });

  it("deposit of all cash leaves cash 0", () => {
    const result = deposit(base, 1000);
    expect(result.cash).toBe(0);
    expect(result.dataCenter).toBe(1500);
    expect(result.dataCenterUsed).toBe(true);
  });

  it("no-op if cannot use data center (status ended)", () => {
    const input = { ...base, status: "ended" as const };
    const result = deposit(input, 100);
    expect(result).toBe(input);
  });

  it("no-op if pendingEvent is set", () => {
    const EVENT: GameEvent = { kind: "customs", good: false, message: "x" };
    const input = { ...base, pendingEvent: EVENT };
    const result = deposit(input, 100);
    expect(result).toBe(input);
  });

  it("no-op if pendingRisk is set", () => {
    const RISK: UptimeRisk = {
      kind: "ransomware",
      message: "x",
      downtime: 20,
      attempts: 0,
      outcome: "pending",
    };
    const input = { ...base, pendingRisk: RISK };
    const result = deposit(input, 100);
    expect(result).toBe(input);
  });

  it("no-op if dataCenterUsed is true", () => {
    const input = { ...base, dataCenterUsed: true };
    const result = deposit(input, 100);
    expect(result).toBe(input);
  });

  it("no-op for amount 0", () => {
    const result = deposit(base, 0);
    expect(result).toBe(base);
  });

  it("no-op for negative amount", () => {
    const result = deposit(base, -50);
    expect(result).toBe(base);
  });

  it("no-op for non-integer amount (1.5)", () => {
    const result = deposit(base, 1.5);
    expect(result).toBe(base);
  });

  it("no-op if amount exceeds cash", () => {
    const result = deposit(base, 1001);
    expect(result).toBe(base);
  });

  it("no-op for zero cash deposit", () => {
    const input = { ...base, cash: 0 };
    const result = deposit(input, 1);
    expect(result).toBe(input);
  });

  it("does not mutate inputs (structuredClone snapshot)", () => {
    const input = { ...base };
    const clone = structuredClone(input);
    deposit(input, 300);
    expect(input).toEqual(clone);
  });
});

describe("withdraw", () => {
  const base = makeState({ cash: 1000, dataCenter: 500 });

  it("moves dataCenter to cash and sets dataCenterUsed", () => {
    const result = withdraw(base, 200);
    expect(result.cash).toBe(1200);
    expect(result.dataCenter).toBe(300);
    expect(result.dataCenterUsed).toBe(true);
    expect(result).not.toBe(base);
  });

  it("withdraw all of the data center", () => {
    const result = withdraw(base, 500);
    expect(result.cash).toBe(1500);
    expect(result.dataCenter).toBe(0);
    expect(result.dataCenterUsed).toBe(true);
  });

  it("no-op if cannot use data center (status ended)", () => {
    const input = { ...base, status: "ended" as const };
    const result = withdraw(input, 100);
    expect(result).toBe(input);
  });

  it("no-op if pendingEvent is set", () => {
    const EVENT: GameEvent = { kind: "customs", good: false, message: "x" };
    const input = { ...base, pendingEvent: EVENT };
    const result = withdraw(input, 100);
    expect(result).toBe(input);
  });

  it("no-op if pendingRisk is set", () => {
    const RISK: UptimeRisk = {
      kind: "ransomware",
      message: "x",
      downtime: 20,
      attempts: 0,
      outcome: "pending",
    };
    const input = { ...base, pendingRisk: RISK };
    const result = withdraw(input, 100);
    expect(result).toBe(input);
  });

  it("no-op if dataCenterUsed is true", () => {
    const input = { ...base, dataCenterUsed: true };
    const result = withdraw(input, 100);
    expect(result).toBe(input);
  });

  it("no-op for amount 0", () => {
    const result = withdraw(base, 0);
    expect(result).toBe(base);
  });

  it("no-op for negative amount", () => {
    const result = withdraw(base, -50);
    expect(result).toBe(base);
  });

  it("no-op for non-integer amount (1.5)", () => {
    const result = withdraw(base, 1.5);
    expect(result).toBe(base);
  });

  it("no-op if amount exceeds dataCenter", () => {
    const result = withdraw(base, 501);
    expect(result).toBe(base);
  });

  it("no-op for zero dataCenter withdraw", () => {
    const input = { ...base, dataCenter: 0 };
    const result = withdraw(input, 1);
    expect(result).toBe(input);
  });

  it("does not mutate inputs (structuredClone snapshot)", () => {
    const input = { ...base };
    const clone = structuredClone(input);
    withdraw(input, 200);
    expect(input).toEqual(clone);
  });
});

// --- chips in the data center ------------------------------------------------
const A = CHIP_IDS[0];
const B = CHIP_IDS[1];

function stocked(overrides: Partial<GameState> = {}): GameState {
  const base = makeState({ cash: 10_000 });
  return {
    ...base,
    market: fill(CHIP_IDS, { price: 100, stock: 50, buyBlocked: false }),
    inventory: { ...base.inventory, [A]: 10 },
    avgCost: { ...base.avgCost, [A]: 80 },
    ...overrides,
  };
}

describe("depositChips / withdrawChips", () => {
  it("newGame starts with an empty data center for every chip", () => {
    const g = newGame({ seed: 3, company: COMPANIES[0], interestEnabled: false });
    expect(Object.keys(g.dataCenterChips).sort()).toEqual([...g.chipIds].sort());
    expect(Object.values(g.dataCenterChips).every((n) => n === 0)).toBe(true);
  });

  it("moves pallets into the data center and uses the day's transaction", () => {
    const s = stocked();
    const after = depositChips(s, A, 4);
    expect(after.inventory[A]).toBe(6);
    expect(after.dataCenterChips[A]).toBe(4);
    expect(after.dataCenterUsed).toBe(true);
    expect(after.avgCost[A]).toBe(80);
    expect(s.inventory[A]).toBe(10); // input untouched
  });

  it("withdraws stored pallets back to hand", () => {
    const s = stocked({ dataCenterChips: { ...fill(CHIP_IDS, 0), [A]: 5 } });
    const after = withdrawChips(s, A, 5);
    expect(after.inventory[A]).toBe(15);
    expect(after.dataCenterChips[A]).toBe(0);
    expect(after.dataCenterUsed).toBe(true);
  });

  it("rejects bad quantities, unknown chips and a second transaction", () => {
    const s = stocked();
    for (const q of [0, -1, 1.5, 11]) expect(depositChips(s, A, q)).toBe(s);
    expect(withdrawChips(s, A, 1)).toBe(s); // nothing stored
    expect(depositChips(s, "not-a-chip", 1)).toBe(s);
    const used = { ...s, dataCenterUsed: true };
    expect(depositChips(used, A, 1)).toBe(used);
    const afterCash = deposit(s, 100);
    expect(depositChips(afterCash, A, 1)).toBe(afterCash); // cash deposit already used today's transaction
  });

  it("stored pallets cannot be sold", () => {
    const s = depositChips(stocked(), A, 10);
    expect(maxSell(s, A)).toBe(0);
    expect(sell(s, A, 1)).toBe(s);
  });
});

describe("average cost covers on-hand and stored pallets", () => {
  it("buying blends with stored pallets too", () => {
    const s = stocked({ inventory: fill(CHIP_IDS, 0), dataCenterChips: { ...fill(CHIP_IDS, 0), [A]: 10 } });
    const after = buy(s, A, 10); // 10 stored @80 + 10 new @100
    expect(after.avgCost[A]).toBe(90);
  });

  it("selling all on-hand keeps the average while pallets are stored", () => {
    const s = stocked({ dataCenterChips: { ...fill(CHIP_IDS, 0), [A]: 3 } });
    expect(sell(s, A, 10).avgCost[A]).toBe(80);
    const none = stocked();
    expect(sell(none, A, 10).avgCost[A]).toBe(0);
  });

  it("a free truck load dilutes the average over all owned pallets", () => {
    const s = stocked({ dataCenterChips: { ...fill(CHIP_IDS, 0), [A]: 10 } }); // 20 owned @80
    const hard = getDifficulty("hard");
    // good event: bad roll fails (0.99), good roll hits (0), pick fellOffTruck (index 0 of 3), chip A, max pallets
    const after = rollEvent(s, new FakeRng([0.99, 0, pickValue(0, 3), pickValue(0, CHIP_IDS.length), 0.99]));
    expect(after.pendingEvent?.kind).toBe("fellOffTruck");
    expect(after.avgCost[A]).toBe((80 * 20) / (20 + hard.truckMax));
  });

  it("missing pallets only hit on-hand chips and keep the average while some are stored", () => {
    const s = stocked({
      inventory: { ...fill(CHIP_IDS, 0), [A]: 1, [B]: 1 },
      avgCost: { ...fill(CHIP_IDS, 0), [A]: 80, [B]: 50 },
      dataCenterChips: { ...fill(CHIP_IDS, 0), [A]: 7 },
    });
    // bad roll hits (0), palletsMissing is index 0 of the 5 bad kinds, base loss draw 0
    const after = rollEvent(s, new FakeRng([0, pickValue(0, 5), 0]));
    expect(after.pendingEvent?.kind).toBe("palletsMissing");
    expect(after.inventory[A]).toBe(0);
    expect(after.inventory[B]).toBe(0);
    expect(after.dataCenterChips).toEqual(s.dataCenterChips);
    expect(after.avgCost[A]).toBe(80); // 7 still stored
    expect(after.avgCost[B]).toBe(0);
  });

  it("fines never touch data center cash", () => {
    const s = stocked({ dataCenter: 5000 });
    // bad roll hits, customs is index 4 of 5, fine at max %
    const after = rollEvent(s, new FakeRng([0, pickValue(4, 5), 0.99]));
    expect(after.pendingEvent?.kind).toBe("customs");
    expect(after.dataCenter).toBe(5000);
    expect(after.cash).toBeLessThan(s.cash);
  });
});
