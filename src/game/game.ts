import type { GameState } from "./types";
import { createRng } from "./rng";
import { CONFIG } from "./data/config";
import { CITIES } from "./data/cities";
import { CHIPS } from "./data/chips";
import { COMPANIES } from "./data/companies";
import { rollMarket, maxBuy, maxSell } from "./market";
import { rollEvent } from "./events";
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
    cityBias,
    chipModifier: Object.fromEntries(chipIds.map((id) => [id, 1])) as Record<string, number>,
    market: {},
    pendingEvent: null,
    status: "playing",
  };

  const market = rollMarket(stateSoFar, rng);
  const rngState = rng.state;

  return {
    ...stateSoFar,
    market,
    rngState,
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

  return {
    ...state,
    cash: state.cash - entry.price * qty,
    market: {
      ...state.market,
      [chipId]: { ...entry, stock: entry.stock - qty },
    },
    inventory: {
      ...state.inventory,
      [chipId]: (state.inventory[chipId] ?? 0) + qty,
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

  return {
    ...state,
    cash: newCash,
    inventory: {
      ...state.inventory,
      [chipId]: newInventory,
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
  if (cityId === state.currentCityId) {
    return state;
  }
  if (!state.cityIds.includes(cityId)) {
    return state;
  }

  const debt = state.interestEnabled ? accrueInterest(state.debt) : state.debt;

  if (state.day === CONFIG.days) {
    return { ...state, debt, status: "ended" };
  }

  const rng = createRng(state.rngState);

  const moved: GameState = {
    ...state,
    day: state.day + 1,
    currentCityId: cityId,
    debt,
  };

  const priced = { ...moved, market: rollMarket(moved, rng) };
  const rolled = rollEvent(priced, rng);

  return { ...rolled, rngState: rng.state };
}

export function isLastDay(state: GameState): boolean {
  return state.status === "playing" && state.day === CONFIG.days;
}

export function profit(state: GameState): number {
  return state.cash - state.debt;
}

export function endMessage(state: GameState): string {
  const p = profit(state);
  const company = state.company;

  if (p > 0) {
    return `Congrats, you are the alpha AI tech bro/bae and generated a profit of ${formatMoney(p)} for ${company}. The first ever profitable AI company!`;
  }
  if (p === 0) {
    return "You payed your loan off. Yay, no cement shoes! Unfortunately you will live a life of mockery for your poor decisions and bad luck.";
  }
  return "You didn't pay your loan in time. It's not that you lost everything, it's not that you have nothing to show for your efforts, it's more coming to terms with not being able to itch your feet in cement shoes!";
}

