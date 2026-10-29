import type { GameState } from "./types";

export function canUseDataCenter(state: GameState): boolean {
  return (
    state.status === "playing" &&
    state.pendingEvent === null &&
    state.pendingRisk === null &&
    !state.dataCenterUsed
  );
}

export function deposit(state: GameState, amount: number): GameState {
  if (!canUseDataCenter(state)) {
    return state;
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > state.cash) {
    return state;
  }

  return { ...state, cash: state.cash - amount, dataCenter: state.dataCenter + amount, dataCenterUsed: true };
}

export function withdraw(state: GameState, amount: number): GameState {
  if (!canUseDataCenter(state)) {
    return state;
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > state.dataCenter) {
    return state;
  }

  return { ...state, cash: state.cash + amount, dataCenter: state.dataCenter - amount, dataCenterUsed: true };
}
