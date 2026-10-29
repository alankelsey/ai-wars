import { describe, it, expect } from "vitest";
import { DIFFICULTIES, DEFAULT_DIFFICULTY, getDifficulty } from "./data/difficulty";
import { newGame } from "./game";
import { COMPANIES } from "./data/companies";
import type { Difficulty } from "./types";

describe("difficulty table", () => {
  it("lists normal, hard, brutal in order, default hard", () => {
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(["normal", "hard", "brutal"]);
    expect(DIFFICULTIES.map((d) => d.label)).toEqual(["Normal", "Hard", "Brutal"]);
    expect(DEFAULT_DIFFICULTY).toBe("hard");
  });

  it("gets harder at every step", () => {
    const [n, h, b] = DIFFICULTIES;
    for (const key of ["badEventChance", "riskChance", "finePctMax", "palletLossPctMax", "palletLossPctCap"] as const) {
      expect(n[key]).toBeLessThan(h[key]);
      expect(h[key]).toBeLessThan(b[key]);
    }
  });

  it("matches the spec numbers for hard", () => {
    expect(getDifficulty("hard")).toEqual({
      id: "hard", label: "Hard", badEventChance: 0.3, goodEventChance: 0.1, riskChance: 0.2,
      finePctMin: 0.05, finePctMax: 0.2, palletLossPctMin: 0.15, palletLossPctMax: 0.35,
      palletLossPerExtraType: 0.1, palletLossPctCap: 0.75, truckMin: 3, truckMax: 10, hypeMin: 2, hypeMax: 5,
    });
  });

  it("throws on an unknown id", () => {
    expect(() => getDifficulty("easy" as Difficulty)).toThrow("Unknown difficulty: easy");
  });
});

describe("newGame difficulty", () => {
  it("defaults to hard and stores the chosen level", () => {
    expect(newGame({ seed: 1, company: COMPANIES[0], interestEnabled: false }).difficulty).toBe("hard");
    expect(newGame({ seed: 1, company: COMPANIES[0], interestEnabled: false, difficulty: "brutal" }).difficulty).toBe("brutal");
  });

  it("does not change the seeded setup", () => {
    const a = newGame({ seed: 9, company: COMPANIES[0], interestEnabled: false, difficulty: "normal" });
    const b = newGame({ seed: 9, company: COMPANIES[0], interestEnabled: false, difficulty: "brutal" });
    expect({ ...a, difficulty: "x" }).toEqual({ ...b, difficulty: "x" });
  });
});
