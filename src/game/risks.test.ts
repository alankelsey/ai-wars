import { describe, it, expect } from "vitest";
import type { GameState, UptimeRisk } from "./types";
import { createRng } from "./rng";
import { rollRisk, tokenResetCost, attemptTokenReset, acceptDowntime, dismissRisk } from "./risks";
import { CONFIG } from "./data/config";
import { RISKS } from "./data/risks";
import { makeState, FakeRng, pickValue } from "./testUtils";

function risk(overrides: Partial<UptimeRisk> = {}): UptimeRisk {
  return { kind: "ransomware", message: "x", downtime: 20, attempts: 0, outcome: "pending", ...overrides };
}

function riskState(overrides: Partial<GameState> = {}): GameState {
  return makeState({ cash: 10000, uptime: 100, pendingRisk: risk(), ...overrides });
}

// Find an rngState whose first next() is below / at-or-above the token-reset chance.
function rngStateWhere(win: boolean): number {
  for (let seed = 1; seed < 10000; seed++) {
    if (createRng(seed).next() < CONFIG.tokenResetChance === win) return seed;
  }
  throw new Error("no seed found");
}
const WIN = rngStateWhere(true);
const LOSE = rngStateWhere(false);

describe("rollRisk", () => {
  it("does nothing (and draws nothing) when a risk is already pending", () => {
    const s = riskState();
    const rng = new FakeRng([0, 0, 0]);
    expect(rollRisk(s, rng)).toBe(s);
    expect(rng.remaining).toBe(3);
  });

  it("returns the same state when the chance roll fails", () => {
    const s = makeState();
    expect(rollRisk(s, new FakeRng([CONFIG.riskChance]))).toBe(s);
  });

  it("picks kind then downtime and fills the message", () => {
    const s = makeState();
    const rng = new FakeRng([0, pickValue(2, RISKS.length), 0.999]);
    const after = rollRisk(s, rng);
    expect(after.pendingRisk).toEqual({
      kind: RISKS[2].kind,
      message: RISKS[2].message.replace("{downtime}", String(CONFIG.downtimeMax)),
      downtime: CONFIG.downtimeMax,
      attempts: 0,
      outcome: "pending",
    });
    expect(after.pendingRisk?.message).not.toContain("{downtime}");
    expect(after.uptime).toBe(100);
    expect(after.cash).toBe(s.cash);
  });
});

describe("tokenResetCost", () => {
  it("is 3% of cash rounded up", () => {
    expect(tokenResetCost(makeState({ cash: 10000 }))).toBe(300);
    expect(tokenResetCost(makeState({ cash: 101 }))).toBe(4);
    expect(tokenResetCost(makeState({ cash: 0 }))).toBe(0);
  });
});

describe("attemptTokenReset", () => {
  it("pays the cost and avoids the downtime on a win", () => {
    const s = riskState({ rngState: WIN });
    const after = attemptTokenReset(s);
    expect(after.cash).toBe(9700);
    expect(after.uptime).toBe(100);
    expect(after.pendingRisk).toEqual({ ...risk(), attempts: 1, outcome: "avoided" });
    expect(after.rngState).not.toBe(s.rngState);
  });

  it("stays pending after a first failure, so the player can try again", () => {
    const after = attemptTokenReset(riskState({ rngState: LOSE }));
    expect(after.cash).toBe(9700);
    expect(after.pendingRisk).toEqual({ ...risk(), attempts: 1, outcome: "pending" });
    expect(after.uptime).toBe(100);
  });

  it("applies the downtime when the second try fails", () => {
    const s = riskState({ rngState: LOSE, pendingRisk: risk({ attempts: 1 }) });
    const after = attemptTokenReset(s);
    expect(after.cash).toBe(9700);
    expect(after.uptime).toBe(80);
    expect(after.pendingRisk).toEqual({ ...risk(), attempts: 2, outcome: "down" });
    expect(after.status).toBe("playing");
  });

  it("never touches the data center", () => {
    const after = attemptTokenReset(riskState({ rngState: LOSE, dataCenter: 5000 }));
    expect(after.dataCenter).toBe(5000);
  });

  it("works with zero cash (costs nothing)", () => {
    const after = attemptTokenReset(riskState({ cash: 0, rngState: WIN }));
    expect(after.cash).toBe(0);
    expect(after.pendingRisk?.outcome).toBe("avoided");
  });

  it("is a no-op with no risk, a resolved risk, tries used up, or an ended game", () => {
    const none = makeState();
    expect(attemptTokenReset(none)).toBe(none);
    const avoided = riskState({ pendingRisk: risk({ outcome: "avoided", attempts: 1 }) });
    expect(attemptTokenReset(avoided)).toBe(avoided);
    const used = riskState({ pendingRisk: risk({ attempts: CONFIG.tokenResetTries }) });
    expect(attemptTokenReset(used)).toBe(used);
    const ended = riskState({ status: "ended" });
    expect(attemptTokenReset(ended)).toBe(ended);
  });

  it("does not mutate the input", () => {
    const s = riskState({ rngState: LOSE });
    const snapshot = structuredClone(s);
    attemptTokenReset(s);
    expect(s).toEqual(snapshot);
  });
});

describe("acceptDowntime", () => {
  it("drops uptime by the downtime without costing money", () => {
    const after = acceptDowntime(riskState());
    expect(after.uptime).toBe(80);
    expect(after.cash).toBe(10000);
    expect(after.pendingRisk?.outcome).toBe("down");
  });

  it("ends the game when uptime reaches exactly 0", () => {
    const after = acceptDowntime(riskState({ uptime: 20 }));
    expect(after.uptime).toBe(0);
    expect(after.status).toBe("ended");
    expect(after.endReason).toBe("uptime");
  });

  it("clamps at 0 and ends the game", () => {
    const after = acceptDowntime(riskState({ uptime: 5 }));
    expect(after.uptime).toBe(0);
    expect(after.endReason).toBe("uptime");
  });

  it("ends the game when the second failed token reset takes uptime to 0", () => {
    const after = attemptTokenReset(riskState({ uptime: 20, rngState: LOSE, pendingRisk: risk({ attempts: 1 }) }));
    expect(after.status).toBe("ended");
    expect(after.endReason).toBe("uptime");
  });

  it("is a no-op when nothing is pending", () => {
    const none = makeState();
    expect(acceptDowntime(none)).toBe(none);
    const down = riskState({ pendingRisk: risk({ outcome: "down" }) });
    expect(acceptDowntime(down)).toBe(down);
  });
});

describe("dismissRisk", () => {
  it("clears a resolved risk", () => {
    expect(dismissRisk(riskState({ pendingRisk: risk({ outcome: "avoided" }) })).pendingRisk).toBeNull();
    expect(dismissRisk(riskState({ pendingRisk: risk({ outcome: "down" }) })).pendingRisk).toBeNull();
  });

  it("keeps a pending risk and is a no-op with none", () => {
    const pending = riskState();
    expect(dismissRisk(pending)).toBe(pending);
    const none = makeState();
    expect(dismissRisk(none)).toBe(none);
  });
});
