import { describe, it, expect } from "vitest";
import { CONFIG } from "./data/config";
import type { HighScore, KeyValueStore } from "./highscores";
import { addHighScore, qualifiesForHighScore, parseHighScores, loadHighScores, saveHighScores } from "./highscores";

function score(cash: number, company = "Lentil"): HighScore {
  return {
    company,
    cash,
    profit: cash - 5500,
    date: "2026-01-01T00:00:00.000Z",
  };
}

class FakeStore implements KeyValueStore {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("addHighScore", () => {
  it("inserts in cash-descending order", () => {
    const list = [score(1000), score(3000), score(2000)];
    const entry = score(2500);
    const result = addHighScore(list, entry);

    expect(result.map((s) => s.cash)).toEqual([3000, 2500, 2000, 1000]);
  });

  it("on equal cash the existing entry stays ahead of the new one", () => {
    const list = [score(2000, "Old"), score(1000)];
    const entry = score(2000, "New");
    const result = addHighScore(list, entry);

    expect(result.map((s) => s.company)).toEqual(["Old", "New", "Lentil"]);
  });

  it("truncates to CONFIG.highScoreLimit", () => {
    const list: HighScore[] = [];
    for (let i = 0; i < CONFIG.highScoreLimit; i++) {
      list.push(score((i + 1) * 100));
    }

    // Add a better score
    const entry = score(10000);
    const result = addHighScore(list, entry);

    expect(result.length).toBe(CONFIG.highScoreLimit);
    expect(result[0].cash).toBe(10000);
    expect(result[result.length - 1].cash).toBe(200); // 100 was dropped
  });

  it("does not mutate the input list", () => {
    const base = [score(3000), score(2000)];
    const list = structuredClone(base);
    const entry = score(4000);

    addHighScore(list, entry);

    expect(list).toEqual(base);
  });

  it("works on an empty list", () => {
    const result = addHighScore([], score(5000));

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(score(5000));
  });
});

describe("qualifiesForHighScore", () => {
  it("true for empty list", () => {
    expect(qualifiesForHighScore([], 9999)).toBe(true);
  });

  it("true when fewer than limit", () => {
    const list = [score(1000), score(500)];
    expect(qualifiesForHighScore(list, 200)).toBe(true);
  });

  it("with a full list true only when cash > lowest", () => {
    const list: HighScore[] = [];
    for (let i = 0; i < CONFIG.highScoreLimit; i++) {
      list.push(score((CONFIG.highScoreLimit - i) * 100));
    }
    const lowest = 100;

    expect(qualifiesForHighScore(list, lowest + 1)).toBe(true);
    expect(qualifiesForHighScore(list, lowest)).toBe(false);
    expect(qualifiesForHighScore(list, lowest - 1)).toBe(false);
  });
});

describe("parseHighScores", () => {
  it("null -> []", () => {
    expect(parseHighScores(null)).toEqual([]);
  });

  it('"not json" -> []', () => {
    expect(parseHighScores("not json")).toEqual([]);
  });

  it('"{}" -> []', () => {
    expect(parseHighScores("{}")).toEqual([]);
  });

  it('drops invalid items (missing field, cash as string)', () => {
    const raw = JSON.stringify([
      { company: "Lentil", cash: 1000, profit: 500, date: "2026-01-01T00:00:00.000Z" },
      { company: "Lentil", cash: "bad", profit: 500, date: "2026-01-01T00:00:00.000Z" },
      { company: "Lentil", cash: 2000, date: "2026-01-01T00:00:00.000Z" }, // missing profit
      { company: "Lentil", cash: 3000, profit: 1500, date: "2026-01-01T00:00:00.000Z" },
    ]);

    const result = parseHighScores(raw);

    expect(result).toHaveLength(2);
    expect(result[0].cash).toBe(3000);
    expect(result[1].cash).toBe(1000);
  });

  it("drops null items", () => {
    const raw = JSON.stringify([null, { company: "Lentil", cash: 500, profit: -500, date: "2026-01-01T00:00:00.000Z" }]);
    const result = parseHighScores(raw);

    expect(result).toHaveLength(1);
    expect(result[0].cash).toBe(500);
  });

  it("sorts unsorted input", () => {
    const raw = JSON.stringify([
      { company: "A", cash: 300, profit: -2500, date: "2026-01-01T00:00:00.000Z" },
      { company: "B", cash: 100, profit: -2700, date: "2026-01-01T00:00:00.000Z" },
      { company: "C", cash: 200, profit: -2600, date: "2026-01-01T00:00:00.000Z" },
    ]);

    const result = parseHighScores(raw);

    expect(result.map((s) => s.cash)).toEqual([300, 200, 100]);
  });

  it("truncates 12 items to 10", () => {
    const list: HighScore[] = [];
    for (let i = 0; i < 12; i++) {
      list.push(score((i + 1) * 100));
    }
    const raw = JSON.stringify(list);

    const result = parseHighScores(raw);

    expect(result).toHaveLength(CONFIG.highScoreLimit);
    expect(result[0].cash).toBe(1200);
    expect(result[result.length - 1].cash).toBe(300);
  });
});

describe("loadHighScores / saveHighScores", () => {
  it("round-trip save then load", () => {
    const store = new FakeStore();
    const list = [score(5000), score(3000)];

    saveHighScores(store, list);

    const loaded = loadHighScores(store);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].cash).toBe(5000);
    expect(loaded[1].cash).toBe(3000);
  });

  it("null store -> [] and false", () => {
    expect(loadHighScores(null)).toEqual([]);
    expect(saveHighScores(null, [])).toBe(false);
  });

  it("a store whose getItem throws -> []", () => {
    const throwingStore = {
      getItem(): string | null {
        throw new Error("fail");
      },
      setItem(): void {},
    };

    expect(loadHighScores(throwingStore as KeyValueStore)).toEqual([]);
  });

  it("a store whose setItem throws -> false", () => {
    const throwingStore = {
      getItem(): string | null {
        return "[]";
      },
      setItem(): void {
        throw new Error("fail");
      },
    };

    expect(saveHighScores(throwingStore as KeyValueStore, [])).toBe(false);
  });

  it("save writes under CONFIG.highScoreKey", () => {
    const store = new FakeStore();
    saveHighScores(store, [score(1000)]);

    expect(store.getItem(CONFIG.highScoreKey)).toBeDefined();
  });
});
