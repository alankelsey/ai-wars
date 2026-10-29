import type { GameState } from "./types";
import { createRng } from "./rng";
import { CONFIG } from "./data/config";
import { CITIES } from "./data/cities";
import { CHIPS } from "./data/chips";
import { COMPANIES } from "./data/companies";
import { rollMarket, maxBuy, maxSell } from "./market";
import { rollEvent } from "./events";
import { rollTips } from "./tips";
import { rollRisk } from "./risks";
import { formatMoney } from "./format";

export interface NewGameOptions {
  seed: number;
  company: string;
  interestEnabled: boolean;
}

export function newGame(opts: NewGameOptions): GameState {
  if (!COMPANIES.includes(opts.company)) {
    throw new Error(`Unknown company: ${opts.company}`);
  }

  const rng = createRng(opts.seed);

  const cityIds = rng.sample(CITIES.map((c) => c.id), CONFIG.citiesPerGame);
  const chipIds = rng.sample(CHIPS.map(c => c.id), CONFIG.chipsPerGame);
  const currentCityId = rng.pick(cityIds);

  const cityBias: Record<string, Record<string, number>> = {};
  for (const cityId of cityIds) {
    cityBias[cityId] = {};
    for (const chipId of chipIds) {
      cityBias[cityId][chipId] = rng.float(CONFIG.cityBiasMin, CONFIG.cityBiasMax);
    }
  }

  const stateSoFar: GameState = {
    seed: opts.seed,
    rngState: rng.state,
    company: opts.company,
    interestEnabled: opts.interestEnabled,
    day: 1,
    cityIds,
    currentCityId,
    chipIds,
    cash: CONFIG.startCash,
    debt: CONFIG.startDebt,
    inventory: Object.fromEntries(chipIds.map((id) => [id, 0])) as Record<string, number>,
    avgCost: Object.fromEntries(chipIds.map((id) => [id, 0])) as Record<string, number>,
    dataCenter: 0,
    dataCenterUsed: false,
    uptime: CONFIG.startUptime,
    tips: [],
    cityBias,
    chipModifier: Object.fromEntries(chipIds.map((id) => [id, 1])) as Record<string, number>,
    market: {},
    pendingEvent: null,
    pendingRisk: null,
    status: "playing",
    endReason: null,
  };

  const withMarket = { ...stateSoFar, market: rollMarket(stateSoFar, rng) };
  const tipped = rollTips(withMarket, rng);

  return {
    ...tipped,
    rngState: rng.state,
  };
}

export function buy(state: GameState, chipId: string, qty: number): GameState {
  if (!Number.isInteger(qty) || qty < 1) {
    return state;
  }

  const max = Math.max(0, maxBuy(state, chipId));
  if (qty > max) {
    return state;
  }

  const entry = state.market[chipId];

  const held = state.inventory[chipId] ?? 0;
  const avg = state.avgCost[chipId];
  const newAvgCost =
    held + qty === 0
      ? 0
      : (avg * held + entry.price * qty) / (held + qty);

  return {
    ...state,
    cash: state.cash - entry.price * qty,
    market: {
      ...state.market,
      [chipId]: { ...entry, stock: entry.stock - qty },
    },
    inventory: {
      ...state.inventory,
      [chipId]: held + qty,
    },
    avgCost: {
      ...state.avgCost,
      [chipId]: newAvgCost,
    },
  };
}

export function sell(state: GameState, chipId: string, qty: number): GameState {
  if (!Number.isInteger(qty) || qty < 1) {
    return state;
  }

  const max = Math.max(0, maxSell(state, chipId));
  if (qty > max) {
    return state;
  }

  const newCash = state.cash + state.market[chipId].price * qty;
  const newInventory = (state.inventory[chipId] ?? 0) - qty;

  let newAvgCost = state.avgCost[chipId];
  if (newInventory === 0) {
    newAvgCost = 0;
  }

  return {
    ...state,
    cash: newCash,
    inventory: {
      ...state.inventory,
      [chipId]: newInventory,
    },
    avgCost: {
      ...state.avgCost,
      [chipId]: newAvgCost,
    },
  };
}

export function dismissEvent(state: GameState): GameState {
  if (state.pendingEvent === null) {
    return state;
  }
  return { ...state, pendingEvent: null };
}

export function accrueInterest(debt: number): number {
  return Math.ceil(debt * (1 + CONFIG.loanApr / 365));
}

export function travel(state: GameState, cityId: string): GameState {
  if (state.status !== "playing") {
    return state;
  }
  if (state.pendingEvent !== null) {
    return state;
  }
  if (state.pendingRisk !== null) {
    return state;
  }
  if (cityId === state.currentCityId) {
    return state;
  }
  if (!state.cityIds.includes(cityId)) {
    return state;
  }

  const debt = state.interestEnabled ? accrueInterest(state.debt) : state.debt;

  if (state.day === CONFIG.days) {
    return { ...state, debt, status: "ended", endReason: "ipo" };
  }

  const rng = createRng(state.rngState);

  const moved: GameState = {
    ...state,
    day: state.day + 1,
    currentCityId: cityId,
    debt,
    dataCenterUsed: false,
    tips: [],
  };

  const priced = { ...moved, market: rollMarket(moved, rng) };
  const tipped = rollTips(priced, rng);
  const rolled = rollEvent(tipped, rng);
  // At most one risk per turn: a bad event (money or market) rules out an uptime risk.
  const risked = hasBadEvent(rolled) ? rolled : rollRisk(rolled, rng);

  return {
    ...risked,
    rngState: rng.state,
  };
}

function hasBadEvent(state: GameState): boolean {
  return state.pendingEvent !== null && !state.pendingEvent.good;
}

export function isLastDay(state: GameState): boolean {
  return state.status === "playing" && state.day === CONFIG.days;
}

export function netWorth(state: GameState): number {
  return state.cash + state.dataCenter - state.debt;
}

export const UPTIME_END_MESSAGE =
  "Your service has become unreachable. Customers fled, the IPO is off, and the loan shark has come to collect — enjoy your new cement shoes!";

export function endMessage(state: GameState): string {
  if (state.endReason === "uptime") {
    return UPTIME_END_MESSAGE;
  }

  const nw = netWorth(state);
  const company = state.company;

  if (nw > 0) {
    return `Congrats, you are the alpha AI tech bro/bae and generated a profit of ${formatMoney(nw)} for ${company}. The first ever profitable AI company!`;
  }
  if (nw === 0) {
    return "You payed your loan off. Yay, no cement shoes! Unfortunately you will live a life of mockery for your poor decisions and bad luck.";
  }
  return "You didn't pay your loan in time. It's not that you lost everything, it's not that you have nothing to show for your efforts, it's more coming to terms with not being able to itch your feet in cement shoes!";
}
