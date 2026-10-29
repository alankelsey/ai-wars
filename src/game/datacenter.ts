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

export function depositChips(state: GameState, chipId: string, qty: number): GameState {
  if (!canUseDataCenter(state)) {
    return state;
  }
  if (!state.chipIds.includes(chipId)) {
    return state;
  }
  if (!Number.isInteger(qty) || qty < 1) {
    return state;
  }

  const onHand = state.inventory[chipId] ?? 0;
  if (qty > onHand) {
    return state;
  }

  const newInventory = { ...state.inventory, [chipId]: onHand - qty };
  const newDataCenterChips = { ...state.dataCenterChips, [chipId]: (state.dataCenterChips[chipId] ?? 0) + qty };

  return {
    ...state,
    inventory: newInventory,
    dataCenterChips: newDataCenterChips,
    dataCenterUsed: true,
  };
}

export function withdrawChips(state: GameState, chipId: string, qty: number): GameState {
  if (!canUseDataCenter(state)) {
    return state;
  }
  if (!state.chipIds.includes(chipId)) {
    return state;
  }
  if (!Number.isInteger(qty) || qty < 1) {
    return state;
  }

  const stored = state.dataCenterChips[chipId] ?? 0;
  if (qty > stored) {
    return state;
  }

  const newInventory = { ...state.inventory, [chipId]: (state.inventory[chipId] ?? 0) + qty };
  const newDataCenterChips = { ...state.dataCenterChips, [chipId]: stored - qty };

  return {
    ...state,
    inventory: newInventory,
    dataCenterChips: newDataCenterChips,
    dataCenterUsed: true,
  };
}
