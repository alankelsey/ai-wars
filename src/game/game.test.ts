import { describe, it, expect } from "vitest";
import type { GameEvent, GameState, MarketEntry, UptimeRisk } from "./types";
import { createRng } from "./rng";
import { rollMarket } from "./market";
import { rollEvent } from "./events";
import { rollTips } from "./tips";
import { rollRisk, acceptDowntime, dismissRisk } from "./risks";
import { CONFIG } from "./data/config";
import { CITIES } from "./data/cities";
import { CHIPS } from "./data/chips";
import { makeState, CHIP_IDS, CITY_IDS } from "./testUtils";
import {
  newGame,
  buy,
  sell,
  dismissEvent,
  accrueInterest,
  travel,
  isLastDay,
  netWorth,
  endMessage,
  UPTIME_END_MESSAGE,
} from "./game";

const CHIP = CHIP_IDS[0];
const PENDING: GameEvent = { kind: "customs", good: false, message: "x" };
const RISK: UptimeRisk = { kind: "ransomware", message: "x", downtime: 20, attempts: 0, outcome: "pending" };

// makeState with every chip priced at 100, stock 50, as fresh objects.
function marketState(overrides: Partial<GameState> = {}): GameState {
  const market: Record<string, MarketEntry> = Object.fromEntries(
    CHIP_IDS.map((id) => [id, { price: 100, stock: 50, buyBlocked: false }])
  );
  return makeState({ cash: 1000, market, ...overrides });
}

function withInventory(state: GameState, chipId: string, pallets: number): GameState {
  return { ...state, inventory: { ...state.inventory, [chipId]: pallets } };
}

describe("newGame", () => {
  const opts = { seed: 1234, company: "Lentil", interestEnabled: false };

  it("throws for an unknown company", () => {
    expect(() => newGame({ ...opts, company: "Nope Inc" })).toThrow();
  });

  it("is deterministic for a seed and different across seeds", () => {
    expect(newGame(opts)).toEqual(newGame(opts));
    expect(newGame({ ...opts, seed: 99 }).cityIds).not.toEqual(newGame(opts).cityIds);
  });

  it("sets up the starting state", () => {
    const g = newGame({ ...opts, interestEnabled: true });
    expect(g.seed).toBe(1234);
    expect(g.company).toBe("Lentil");
    expect(g.interestEnabled).toBe(true);
    expect(g.day).toBe(1);
    expect(g.cash).toBe(CONFIG.startCash);
    expect(g.debt).toBe(CONFIG.startDebt);
    expect(g.status).toBe("playing");
    expect(g.pendingEvent).toBeNull();
    expect(g.pendingRisk).toBeNull();
    expect(g.endReason).toBeNull();
    expect(g.dataCenter).toBe(0);
    expect(g.dataCenterUsed).toBe(false);
    expect(g.uptime).toBe(CONFIG.startUptime);
    g.chipIds.forEach((id) => expect(g.avgCost[id]).toBe(0));
  });

  it("picks 6 distinct cities and 12 distinct chips from the data", () => {
    const g = newGame(opts);
    const cityIds = CITIES.map((c) => c.id);
    const chipIds = CHIPS.map((c) => c.id);
    expect(new Set(g.cityIds).size).toBe(CONFIG.citiesPerGame);
    expect(new Set(g.chipIds).size).toBe(CONFIG.chipsPerGame);
    g.cityIds.forEach((id) => expect(cityIds).toContain(id));
    g.chipIds.forEach((id) => expect(chipIds).toContain(id));
    expect(g.cityIds).toContain(g.currentCityId);
  });

  it("draws cities, chips, start city, biases, then market in that order", () => {
    const g = newGame(opts);
    const rng = createRng(opts.seed);
    expect(g.cityIds).toEqual(rng.sample(CITIES.map((c) => c.id), CONFIG.citiesPerGame));
    expect(g.chipIds).toEqual(rng.sample(CHIPS.map((c) => c.id), CONFIG.chipsPerGame));
    expect(g.currentCityId).toBe(rng.pick(g.cityIds));
    for (const cityId of g.cityIds) {
      for (const chipId of g.chipIds) {
        expect(g.cityBias[cityId][chipId]).toBe(rng.float(CONFIG.cityBiasMin, CONFIG.cityBiasMax));
      }
    }
    const priced = { ...g, market: rollMarket(g, rng), tips: [] };
    const tipped = rollTips(priced, rng);
    expect(g.market).toEqual(tipped.market);
    expect(g.tips).toEqual(tipped.tips);
    expect(g.rngState).toBe(rng.state);
  });

  it("starts with empty inventory, modifier 1 and a market for every chip", () => {
    const g = newGame(opts);
    for (const chipId of g.chipIds) {
      expect(g.inventory[chipId]).toBe(0);
      expect(g.chipModifier[chipId]).toBe(1);
      expect(g.market[chipId].price).toBeGreaterThanOrEqual(1);
    }
    expect(Object.keys(g.inventory)).toHaveLength(CONFIG.chipsPerGame);
    expect(Object.keys(g.market)).toHaveLength(CONFIG.chipsPerGame);
  });
});

describe("buy", () => {
  it("moves cash, stock and inventory", () => {
    const s = marketState();
    const after = buy(s, CHIP, 3);
    expect(after.cash).toBe(700);
    expect(after.market[CHIP].stock).toBe(47);
    expect(after.inventory[CHIP]).toBe(3);
  });

  it("does not mutate the input", () => {
    const s = marketState();
    const snapshot = structuredClone(s);
    buy(s, CHIP, 3);
    expect(s).toEqual(snapshot);
  });

  it("can spend cash down to exactly zero", () => {
    const after = buy(marketState(), CHIP, 10);
    expect(after.cash).toBe(0);
    expect(after.inventory[CHIP]).toBe(10);
  });

  it.each([
    ["zero qty", 0],
    ["negative qty", -1],
    ["fractional qty", 1.5],
    ["more than cash allows", 11],
  ])("is a no-op for %s", (_label, qty) => {
    const s = marketState();
    expect(buy(s, CHIP, qty)).toBe(s);
  });

  it("is a no-op beyond stock, when blocked, with zero cash, pending event or ended", () => {
    const low = marketState({ cash: 100000 });
    const lowStock = { ...low, market: { ...low.market, [CHIP]: { price: 100, stock: 2, buyBlocked: false } } };
    expect(buy(lowStock, CHIP, 3)).toBe(lowStock);
    const blockedBase = marketState();
    const blocked = { ...blockedBase, market: { ...blockedBase.market, [CHIP]: { price: 100, stock: 50, buyBlocked: true } } };
    expect(buy(blocked, CHIP, 1)).toBe(blocked);
    const broke = marketState({ cash: 0 });
    expect(buy(broke, CHIP, 1)).toBe(broke);
    const pending = marketState({ pendingEvent: PENDING });
    expect(buy(pending, CHIP, 1)).toBe(pending);
    const ended = marketState({ status: "ended" });
    expect(buy(ended, CHIP, 1)).toBe(ended);
  });

  it("is a no-op for a chip not in the market", () => {
    const s = marketState();
    expect(buy(s, "buckwell", 1)).toBe(s);
  });
});

describe("sell", () => {
  it("adds cash and removes inventory, stock unchanged", () => {
    const s = withInventory(marketState(), CHIP, 5);
    const after = sell(s, CHIP, 5);
    expect(after.cash).toBe(1500);
    expect(after.inventory[CHIP]).toBe(0);
    expect(after.market[CHIP].stock).toBe(50);
  });

  it("does not mutate the input", () => {
    const s = withInventory(marketState(), CHIP, 5);
    const snapshot = structuredClone(s);
    sell(s, CHIP, 2);
    expect(s).toEqual(snapshot);
  });

  it("works from zero cash", () => {
    const after = sell(withInventory(marketState({ cash: 0 }), CHIP, 1), CHIP, 1);
    expect(after.cash).toBe(100);
  });

  it("is a no-op for bad qty, more than held, zero stock held, pending event or ended", () => {
    const s = withInventory(marketState(), CHIP, 5);
    expect(sell(s, CHIP, 0)).toBe(s);
    expect(sell(s, CHIP, 2.5)).toBe(s);
    expect(sell(s, CHIP, 6)).toBe(s);
    const none = marketState();
    expect(sell(none, CHIP, 1)).toBe(none);
    const pending = { ...s, pendingEvent: PENDING };
    expect(sell(pending, CHIP, 1)).toBe(pending);
    const ended: GameState = { ...s, status: "ended" };
    expect(sell(ended, CHIP, 1)).toBe(ended);
  });

  it("sells a sanctioned chip (only buying is blocked)", () => {
    const base = withInventory(marketState(), CHIP, 2);
    const s = { ...base, market: { ...base.market, [CHIP]: { price: 100, stock: 50, buyBlocked: true } } };
    expect(sell(s, CHIP, 2).cash).toBe(1200);
  });
});

describe("dismissEvent", () => {
  it("clears the pending event", () => {
    expect(dismissEvent(marketState({ pendingEvent: PENDING })).pendingEvent).toBeNull();
  });

  it("returns the same state when nothing is pending", () => {
    const s = marketState();
    expect(dismissEvent(s)).toBe(s);
  });
});

describe("accrueInterest", () => {
  it("compounds one day and rounds up", () => {
    expect(accrueInterest(5500)).toBe(Math.ceil(5500 * (1 + CONFIG.loanApr / 365)));
    expect(accrueInterest(5500)).toBe(5502);
  });

  it("keeps zero debt at zero", () => {
    expect(accrueInterest(0)).toBe(0);
  });
});

describe("travel", () => {
  it("is a no-op to the current city, an unknown city, with a pending event or when ended", () => {
    const s = marketState();
    expect(travel(s, s.currentCityId)).toBe(s);
    expect(travel(s, "atlantis")).toBe(s);
    const pending = marketState({ pendingEvent: PENDING });
    expect(travel(pending, CITY_IDS[1])).toBe(pending);
    const ended = marketState({ status: "ended" });
    expect(travel(ended, CITY_IDS[1])).toBe(ended);
    const risky = marketState({ pendingRisk: RISK });
    expect(travel(risky, CITY_IDS[1])).toBe(risky);
  });

  it("advances the day, rolls market, tips, event, risk from rngState, and stores the new rngState", () => {
    for (const rngState of [1, 77, 4242, 99999, 123456, 777777]) {
      const base = withInventory(marketState({ rngState, day: 4, dataCenterUsed: true }), CHIP, 8);
      const s = { ...base, tips: [{ chipId: CHIP, cheap: true, message: "stale" }] };
      const rng = createRng(rngState);
      const moved: GameState = { ...s, day: 5, currentCityId: CITY_IDS[2], dataCenterUsed: false, tips: [] };
      const priced = { ...moved, market: rollMarket(moved, rng) };
      const expected = rollRisk(rollEvent(rollTips(priced, rng), rng), rng);
      expect(travel(s, CITY_IDS[2])).toEqual({ ...expected, rngState: rng.state });
    }
  });

  it("does not mutate the input", () => {
    const s = withInventory(marketState({ interestEnabled: true }), CHIP, 8);
    const snapshot = structuredClone(s);
    travel(s, CITY_IDS[1]);
    expect(s).toEqual(snapshot);
  });

  it("charges interest only when enabled", () => {
    const on = marketState({ debt: 5500, interestEnabled: true });
    const off = marketState({ debt: 5500, interestEnabled: false });
    expect(travel(on, CITY_IDS[1]).debt).toBe(5502);
    expect(travel(off, CITY_IDS[1]).debt).toBe(5500);
  });

  it("ends the game when leaving the last day without rolling anything", () => {
    const s = marketState({ day: CONFIG.days, debt: 5500, interestEnabled: true });
    const after = travel(s, CITY_IDS[1]);
    expect(after).toEqual({ ...s, debt: 5502, status: "ended", endReason: "ipo" });
  });

  it("plays seeded games to the end, through uptime risks", () => {
    let totalRisks = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let g = newGame({ seed, company: "SMuC", interestEnabled: true });
      let travels = 0;
      while (g.status === "playing") {
        g = dismissEvent(g);
        if (g.pendingRisk) {
          totalRisks++;
          g = dismissRisk(acceptDowntime(g));
          continue;
        }
        const next = g.cityIds.find((id) => id !== g.currentCityId);
        if (next === undefined) throw new Error("no city to travel to");
        g = travel(g, next);
        travels++;
      }
      if (g.endReason === "ipo") {
        expect(travels).toBe(CONFIG.days);
        expect(g.day).toBe(CONFIG.days);
        let debt: number = CONFIG.startDebt;
        for (let i = 0; i < CONFIG.days; i++) debt = accrueInterest(debt);
        expect(g.debt).toBe(debt);
      } else {
        expect(g.endReason).toBe("uptime");
        expect(g.uptime).toBe(0);
        expect(travels).toBeLessThan(CONFIG.days);
      }
    }
    expect(totalRisks).toBeGreaterThan(0);
  });
});

describe("isLastDay / netWorth / endMessage", () => {
  it("flags only day 30 while playing", () => {
    expect(isLastDay(marketState({ day: CONFIG.days }))).toBe(true);
    expect(isLastDay(marketState({ day: CONFIG.days - 1 }))).toBe(false);
    expect(isLastDay(marketState({ day: CONFIG.days, status: "ended" }))).toBe(false);
  });

  it("net worth is cash plus data center minus debt, and can be negative with cash in hand", () => {
    expect(netWorth(marketState({ cash: 7000, debt: 5500 }))).toBe(1500);
    expect(netWorth(marketState({ cash: 0, debt: 5500 }))).toBe(-5500);
    expect(netWorth(marketState({ cash: 1000, dataCenter: 2000, debt: 5500 }))).toBe(-2500);
    expect(netWorth(marketState({ cash: 3000, dataCenter: 4000, debt: 5500 }))).toBe(1500);
  });

  it("congratulates on profit with formatted money and company", () => {
    expect(endMessage(marketState({ cash: 12000, debt: 5500, company: "Frugal" }))).toBe(
      "Congrats, you are the alpha AI tech bro/bae and generated a profit of $6,500 for Frugal. The first ever profitable AI company!"
    );
  });

  it("has the break-even message", () => {
    expect(endMessage(marketState({ cash: 5500, debt: 5500 }))).toBe(
      "You payed your loan off. Yay, no cement shoes! Unfortunately you will live a life of mockery for your poor decisions and bad luck."
    );
  });

  it("has the loss message", () => {
    expect(endMessage(marketState({ cash: 5499, debt: 5500 }))).toMatch(/^You didn't pay your loan in time\./);
    expect(endMessage(marketState({ cash: 5499, debt: 5500 }))).toMatch(/cement shoes!$/);
  });

  it("counts the data center in the end message", () => {
    expect(endMessage(marketState({ cash: 500, dataCenter: 5000, debt: 5500 }))).toMatch(/^You payed your loan off\./);
  });

  it("has the uptime game-over message regardless of money", () => {
    expect(endMessage(marketState({ cash: 99999, debt: 5500, status: "ended", endReason: "uptime" }))).toBe(
      UPTIME_END_MESSAGE
    );
    expect(UPTIME_END_MESSAGE).toMatch(/^Your service has become unreachable\..*loan shark.*cement shoes!$/);
  });
});

describe("average cost", () => {
  it("is the price paid on the first buy", () => {
    expect(buy(marketState(), CHIP, 3).avgCost[CHIP]).toBe(100);
  });

  it("is weighted across buys at different prices", () => {
    const first = buy(marketState({ cash: 100000 }), CHIP, 2); // 2 @ 100
    const repriced = { ...first, market: { ...first.market, [CHIP]: { price: 400, stock: 50, buyBlocked: false } } };
    const second = buy(repriced, CHIP, 1); // 1 @ 400
    expect(second.avgCost[CHIP]).toBe(200);
  });

  it("is unchanged by a partial sell and resets to 0 when everything is sold", () => {
    const bought = buy(marketState(), CHIP, 4);
    expect(sell(bought, CHIP, 1).avgCost[CHIP]).toBe(100);
    expect(sell(bought, CHIP, 4).avgCost[CHIP]).toBe(0);
  });
});
