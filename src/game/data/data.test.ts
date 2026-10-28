import { describe, it, expect } from "vitest";
import { CHIPS, getChip } from "./chips";
import { CITIES, getCity } from "./cities";
import { COMPANIES } from "./companies";
import { CONFIG } from "./config";

describe("data", () => {
  it("13 chips", () => {
    expect(CHIPS.length).toBe(13);
  });

  it("10 cities", () => {
    expect(CITIES.length).toBe(10);
  });

  it("14 companies", () => {
    expect(COMPANIES.length).toBe(14);
  });

  it("chip ids are unique", () => {
    const ids = CHIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("city ids are unique", () => {
    const ids = CITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every chip minPrice < maxPrice and > 0", () => {
    for (const chip of CHIPS) {
      expect(chip.minPrice).toBeLessThan(chip.maxPrice);
      expect(chip.minPrice).toBeGreaterThan(0);
    }
  });

  it("4 budget / 5 mid / 4 premium", () => {
    const budget = CHIPS.filter((c) => c.tier === "budget").length;
    const mid = CHIPS.filter((c) => c.tier === "mid").length;
    const premium = CHIPS.filter((c) => c.tier === "premium").length;
    expect(budget).toBe(4);
    expect(mid).toBe(5);
    expect(premium).toBe(4);
  });

  it("at least 4 chips have minPrice below CONFIG.startCash / 10", () => {
    const threshold = CONFIG.startCash / 10;
    const affordable = CHIPS.filter((c) => c.minPrice < threshold).length;
    expect(affordable).toBeGreaterThanOrEqual(4);
  });

  it("getChip throws on unknown id", () => {
    expect(() => getChip("unknown")).toThrow();
  });

  it("getCity throws on unknown id", () => {
    expect(() => getCity("unknown")).toThrow();
  });

  it("config: citiesPerGame <= CITIES.length", () => {
    expect(CONFIG.citiesPerGame).toBeLessThanOrEqual(CITIES.length);
  });

  it("config: chipsPerGame <= CHIPS.length", () => {
    expect(CONFIG.chipsPerGame).toBeLessThanOrEqual(CHIPS.length);
  });
});
