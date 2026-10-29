// High scores: load/save via KeyValueStore, add, sort, and truncate list.
import type { Difficulty } from "./types";
import { DIFFICULTIES } from "./data/difficulty";
import { CONFIG } from "./data/config";

export interface HighScore {
  company: string;
  cash: number;
  profit: number;
  date: string;
  difficulty?: Difficulty;
}

function isValidDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && DIFFICULTIES.some((d) => d.id === value);
}

function isValidHighScoreItem(item: unknown): item is HighScore {
  if (typeof item !== "object" || item === null) {
    return false;
  }
  const typed = item as Record<string, unknown>;
  if (typeof typed.company !== "string") {
    return false;
  }
  if (typeof typed.cash !== "number" || !Number.isFinite(typed.cash)) {
    return false;
  }
  if (typeof typed.profit !== "number" || !Number.isFinite(typed.profit)) {
    return false;
  }
  if (typeof typed.date !== "string") {
    return false;
  }
  if ("difficulty" in typed && typed.difficulty !== undefined) {
    if (!isValidDifficulty(typed.difficulty)) {
      return false;
    }
  }
  return true;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function addHighScore(list: readonly HighScore[], entry: HighScore): HighScore[] {
  const withIndices = list.map((item, index) => ({ item, index }));
  const newList = [...withIndices, { item: entry, index: list.length }];

  newList.sort((a, b) => {
    if (b.item.cash !== a.item.cash) {
      return b.item.cash - a.item.cash;
    }
    return a.index - b.index;
  });

  const truncated = newList.slice(0, CONFIG.highScoreLimit);
  return truncated.map(({ item }) => item);
}

export function qualifiesForHighScore(list: readonly HighScore[], cash: number): boolean {
  if (list.length < CONFIG.highScoreLimit) {
    return true;
  }
  const lowestCash = Math.min(...list.map((s) => s.cash));
  return cash > lowestCash;
}

export function parseHighScores(raw: string | null): HighScore[] {
  if (raw === null) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const validItems = parsed.filter(isValidHighScoreItem);

  // Sort by cash descending, stable for equal cash
  const withIndices = validItems.map((item, index) => ({ item, index }));
  withIndices.sort((a, b) => {
    if (b.item.cash !== a.item.cash) {
      return b.item.cash - a.item.cash;
    }
    return a.index - b.index;
  });

  return withIndices.map(({ item }) => item).slice(0, CONFIG.highScoreLimit);
}

export function loadHighScores(store: KeyValueStore | null): HighScore[] {
  if (store === null) {
    return [];
  }

  try {
    const raw = store.getItem(CONFIG.highScoreKey);
    return parseHighScores(raw);
  } catch {
    return [];
  }
}

export function saveHighScores(store: KeyValueStore | null, list: readonly HighScore[]): boolean {
  if (store === null) {
    return false;
  }

  try {
    const json = JSON.stringify(list);
    store.setItem(CONFIG.highScoreKey, json);
    return true;
  } catch {
    return false;
  }
}
