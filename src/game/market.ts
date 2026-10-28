import type { GameState, MarketEntry } from "./types";
import type { Rng } from "./rng";
import { CONFIG } from "./data/config";
import { getChip } from "./data/chips";

export function rollMarket(state: GameState, rng: Rng): Record<string, MarketEntry> {
  const market: Record<string, MarketEntry> = {};

  for (const chipId of state.chipIds) {
    const chip = getChip(chipId);
    const bias = state.cityBias[state.currentCityId][chipId];
    const modifier = state.chipModifier[chipId];

    const base = rng.float(chip.minPrice, chip.maxPrice);
    const priceRaw = base * bias * modifier;
    const price = Math.max(1, Math.round(priceRaw));
    const stock = rng.int(CONFIG.stockMin, CONFIG.stockMax);

    market[chipId] = {
      price,
      stock,
      buyBlocked: false,
    };
  }

  return market;
}

export function maxBuy(state: GameState, chipId: string): number {
  if (state.status !== "playing") return 0;
  if (state.pendingEvent !== null) return 0;

  const entry = state.market[chipId];
  if (!entry) return 0;
  if (entry.buyBlocked) return 0;

  const canAfford = Math.floor(state.cash / entry.price);
  return Math.min(entry.stock, canAfford);
}

export function maxSell(state: GameState, chipId: string): number {
  if (state.status !== "playing") return 0;
  if (state.pendingEvent !== null) return 0;

  return state.inventory[chipId] ?? 0;
}
