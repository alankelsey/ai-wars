import { describe, it, expect } from "vitest";
import type { GameEvent, UptimeRisk } from "./types";
import { canUseDataCenter, deposit, withdraw } from "./datacenter";
import { makeState } from "./testUtils";

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
