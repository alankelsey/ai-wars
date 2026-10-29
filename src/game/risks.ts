import type { GameState, UptimeRisk } from "./types";
import { createRng, type Rng } from "./rng";
import { getDifficulty } from "./data/difficulty";
import { CONFIG } from "./data/config";
import { RISKS, getRisk } from "./data/risks";

export function rollRisk(state: GameState, rng: Rng): GameState {
  if (state.pendingRisk !== null) {
    return state;
  }

  const d = getDifficulty(state.difficulty);

  if (!rng.chance(d.riskChance)) {
    return state;
  }

  const kind = rng.pick(RISKS).kind;
  const downtime = rng.int(CONFIG.downtimeMin, CONFIG.downtimeMax);
  const message = getRisk(kind).message.replace("{downtime}", String(downtime));

  const pendingRisk = {
    kind,
    message,
    downtime,
    attempts: 0,
    outcome: "pending" as const,
  };

  return { ...state, pendingRisk };
}

export function tokenResetCost(state: GameState): number {
  return Math.ceil(state.cash * CONFIG.tokenResetPct);
}

export function attemptTokenReset(state: GameState): GameState {
  if (state.status !== "playing") {
    return state;
  }
  if (state.pendingRisk === null) {
    return state;
  }
  if (state.pendingRisk.outcome !== "pending") {
    return state;
  }
  if (state.pendingRisk.attempts >= CONFIG.tokenResetTries) {
    return state;
  }

  const attempts = state.pendingRisk.attempts + 1;
  const rng = createRng(state.rngState);
  const paid: GameState = {
    ...state,
    cash: state.cash - tokenResetCost(state),
    pendingRisk: { ...state.pendingRisk, attempts },
  };

  let next: GameState = paid;
  if (rng.chance(CONFIG.tokenResetChance)) {
    next = withOutcome(paid, "avoided");
  } else if (attempts === CONFIG.tokenResetTries) {
    next = applyDowntime(paid);
  }
  return { ...next, rngState: rng.state };
}

export function acceptDowntime(state: GameState): GameState {
  if (state.pendingRisk === null || state.pendingRisk.outcome !== "pending") {
    return state;
  }
  return applyDowntime(state);
}

function withOutcome(state: GameState, outcome: UptimeRisk["outcome"]): GameState {
  return state.pendingRisk === null ? state : { ...state, pendingRisk: { ...state.pendingRisk, outcome } };
}

// Uptime drops by the risk's downtime; at 0 the game ends.
function applyDowntime(state: GameState): GameState {
  if (state.pendingRisk === null) return state;
  const uptime = Math.max(0, state.uptime - state.pendingRisk.downtime);
  const down = withOutcome({ ...state, uptime }, "down");
  return uptime === 0 ? { ...down, status: "ended", endReason: "uptime" } : down;
}

export function dismissRisk(state: GameState): GameState {
  if (state.pendingRisk === null) {
    return state;
  }
  if (state.pendingRisk.outcome === "pending") {
    return state;
  }

  return { ...state, pendingRisk: null };
}
