import { describe, it, expect } from "vitest";
import type { AppState } from "./gameReducer";
import type { GameState } from "@/game/types";
import { appReducer, initialAppState } from "./gameReducer";
import { newGame } from "@/game/game";

function makeBaseState(): GameState {
  const seed = 7;
  const company = "Lentil";
  const interestEnabled = false;

  return newGame({ seed, company, interestEnabled });
}

describe("appReducer", () => {
  describe("splash -> game screen", () => {
    it("starts a fresh game with the given options", () => {
      const state = initialAppState;
      const action = { type: "start", seed: 7, company: "Lentil", interestEnabled: false } as const;

      const result = appReducer(state, action);

      expect(result.screen).toBe("game");
      if (result.screen !== "game") {
        throw new Error("Expected game screen");
      }

      const expected = newGame({ seed: 7, company: "Lentil", interestEnabled: false });

      expect(result.game).toEqual(expected);
    });
  });

  describe("start from game screen", () => {
    it("starts a fresh game (replaces current game)", () => {
      const base = makeBaseState();
      const state: AppState = { screen: "game", game: base };
      const action = { type: "start", seed: 42, company: "Frugal", interestEnabled: true } as const;

      const result = appReducer(state, action);

      expect(result.screen).toBe("game");
      if (result.screen !== "game") {
        throw new Error("Expected game screen");
      }
      const expected = newGame({ seed: 42, company: "Frugal", interestEnabled: true });
      expect(result.game).toEqual(expected);
    });
  });

  describe("reset -> initialAppState", () => {
    it("returns initialAppState from splash", () => {
      const state = initialAppState;
      const action = { type: "reset" } as const;

      const result = appReducer(state, action);

      expect(result).toBe(initialAppState);
    });

    it("returns initialAppState from game screen", () => {
      const base = makeBaseState();
      const state: AppState = { screen: "game", game: base };
      const action = { type: "reset" } as const;

      const result = appReducer(state, action);

      expect(result).toBe(initialAppState);
    });
  });

  describe("buy/sell/travel/dismiss on splash returns same object (toBe)", () => {
    it("buy on splash returns same state", () => {
      const state = initialAppState;
      const action = { type: "buy", chipId: "a1", qty: 1 } as const;

      const result = appReducer(state, action);

      expect(result).toBe(state);
    });

    it("sell on splash returns same state", () => {
      const state = initialAppState;
      const action = { type: "sell", chipId: "a1", qty: 1 } as const;

      const result = appReducer(state, action);

      expect(result).toBe(state);
    });

    it("travel on splash returns same state", () => {
      const state = initialAppState;
      const action = { type: "travel", cityId: "nyc" } as const;

      const result = appReducer(state, action);

      expect(result).toBe(state);
    });

    it("dismiss on splash returns same state", () => {
      const state = initialAppState;
      const action = { type: "dismiss" } as const;

      const result = appReducer(state, action);

      expect(result).toBe(state);
    });
  });

  describe("no-op buy (qty 0) on game screen returns same AppState object (toBe)", () => {
    it("returns same state when qty is zero", () => {
      const base = makeBaseState();
      const chipId = base.chipIds[0];
      const state: AppState = { screen: "game", game: base };
      const action = { type: "buy", chipId, qty: 0 } as const;

      const result = appReducer(state, action);

      expect(result).toBe(state);
    });
  });

  describe("valid buy changes cash by the price of the cheapest chip", () => {
    it("buys one unit of the cheapest chip and reduces cash accordingly", () => {
      const base = makeBaseState();
      let minPrice = Infinity;
      let cheapestChipId = "";
      for (const id of base.chipIds) {
        const entry = base.market[id];
        if (entry && entry.price < minPrice) {
          minPrice = entry.price;
          cheapestChipId = id;
        }
      }

      expect(cheapestChipId).not.toBe("");

      const state: AppState = { screen: "game", game: base };
      const action = { type: "buy", chipId: cheapestChipId, qty: 1 } as const;

      const result = appReducer(state, action);

      expect(result).not.toBe(state);
      if (result.screen !== "game") {
        throw new Error("Expected game screen");
      }

      const entry = base.market[cheapestChipId];
      if (!entry) {
        throw new Error("Market entry missing for cheapest chip");
      }

      expect(result.game.cash).toBe(state.game.cash - entry.price);
    });
  });

  describe("travel to a different city advances day", () => {
    it("advances game.day to 2 when traveling from day 1", () => {
      const base = makeBaseState();
      expect(base.cityIds.length).toBeGreaterThanOrEqual(2);
      const otherCityId = base.cityIds.find((id) => id !== base.currentCityId);
      if (!otherCityId) throw new Error("No other city found");

      const state: AppState = { screen: "game", game: base };
      const action = { type: "travel", cityId: otherCityId } as const;

      const result = appReducer(state, action);

      expect(result).not.toBe(state);
      if (result.screen !== "game") {
        throw new Error("Expected game screen");
      }
      expect(result.game.day).toBe(2);
    });
  });

  describe("dismiss with pendingEvent clears it", () => {
    it("clears pendingEvent when present", () => {
      const base = makeBaseState();
      const state: AppState = {
        screen: "game",
        game: { ...base, pendingEvent: { kind: "customs", good: false, message: "x" } },
      };
      const action = { type: "dismiss" } as const;

      const result = appReducer(state, action);

      expect(result).not.toBe(state);
      if (result.screen !== "game") {
        throw new Error("Expected game screen");
      }
      expect(result.game.pendingEvent).toBeNull();
    });
  });
});
