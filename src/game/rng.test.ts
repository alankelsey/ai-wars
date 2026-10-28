import { describe, it, expect } from "vitest";
import { createRng, seedFromString } from "./rng";

describe("rng", () => {
  describe("createRng", () => {
    it("same seed produces same sequence", () => {
      const r1 = createRng(12345);
      const r2 = createRng(12345);

      expect(r1.next()).toBe(r2.next());
      expect(r1.next()).toBe(r2.next());
      expect(r1.int(1, 10)).toBe(r2.int(1, 10));
      expect(r1.float(0, 1)).toBe(r2.float(0, 1));
    });

    it("different seeds produce different sequences", () => {
      const r1 = createRng(12345);
      const r2 = createRng(54321);

      // Very unlikely to be equal on first few calls
      expect(r1.next()).not.toBe(r2.next());
      expect(r1.int(1, 100)).not.toBe(r2.int(1, 100));
    });

    it("int bounds are inclusive and both ends reachable over many draws", () => {
      const r = createRng(999);
      const min = 5;
      const max = 10;
      const seen = new Set<number>();
      for (let i = 0; i < 1000; i++) {
        const v = r.int(min, max);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
        seen.add(v);
      }
      // With 6 possible values and 1000 draws, we should see all
      expect(seen.size).toBe(max - min + 1);
    });

    it("float is in [min, max)", () => {
      const r = createRng(777);
      const min = 2.5;
      const max = 5.0;
      for (let i = 0; i < 100; i++) {
        const v = r.float(min, max);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThan(max);
      }
    });

    it("pick from small arrays", () => {
      const r = createRng(42);
      const arr = ["a", "b", "c"];
      for (let i = 0; i < 100; i++) {
        const v = r.pick(arr);
        expect(arr).toContain(v);
      }
    });

    it("sample returns distinct items", () => {
      const r = createRng(123);
      const arr = [1, 2, 3, 4, 5];
      const s = r.sample(arr, 3);
      expect(new Set(s).size).toBe(3);
      expect(s.every((x) => arr.includes(x))).toBe(true);
    });

    it("sample throws if n > length", () => {
      const r = createRng(123);
      expect(() => r.sample([1, 2], 3)).toThrow(RangeError);
    });

    it("pick throws on empty array", () => {
      const r = createRng(123);
      expect(() => r.pick([])).toThrow(RangeError);
    });

    it("int throws if max < min", () => {
      const r = createRng(123);
      expect(() => r.int(10, 5)).toThrow(RangeError);
    });

    it("float throws if max < min", () => {
      const r = createRng(123);
      expect(() => r.float(10, 5)).toThrow(RangeError);
    });

    it("chance(0) always false, chance(1) always true", () => {
      const r = createRng(555);
      for (let i = 0; i < 100; i++) {
        expect(r.chance(0)).toBe(false);
        expect(r.chance(1)).toBe(true);
      }
    });

    it("state changes after next() and createRng(rng.state) continues the same sequence", () => {
      const r1 = createRng(9999);
      const initial = r1.state;
      expect(initial).toBeGreaterThan(0);

      // Draw 5 values from r1
      for (let i = 0; i < 5; i++) {
        r1.next();
        // Assert r1.state is a uint32 after each draw
        expect(Number.isInteger(r1.state)).toBe(true);
        expect(r1.state).toBeGreaterThanOrEqual(0);
        expect(r1.state).toBeLessThanOrEqual(2 ** 32 - 1);
      }

      const r2 = createRng(r1.state);

      // Now both generators draw in lockstep
      for (let i = 0; i < 5; i++) {
        expect(r2.next()).toBe(r1.next());
        expect(r2.state).toBe(r1.state);
        expect(Number.isInteger(r1.state)).toBe(true);
        expect(r1.state).toBeGreaterThanOrEqual(0);
        expect(r1.state).toBeLessThanOrEqual(2 ** 32 - 1);
      }
    });
  });

  describe("seedFromString", () => {
    it("known FNV-1a vectors", () => {
      expect(seedFromString("")).toBe(2166136261);
      expect(seedFromString("a")).toBe(0xe40c292c);
    });

    it("returns a uint32", () => {
      const s = seedFromString("hello world");
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(0xffffffff);
    });

    it("deterministic hash", () => {
      expect(seedFromString("test")).toBe(seedFromString("test"));
      expect(seedFromString("test")).not.toBe(seedFromString("Test"));
    });

    it("same string gives same seed", () => {
      const s1 = seedFromString("hello");
      const s2 = seedFromString("hello");
      expect(s1).toBe(s2);
    });
  });
});
