// Tips: chance to generate a market tip with price adjustment and message template.
import type { GameState, MarketEntry, MarketTip } from "./types";
import type { Rng } from "./rng";
import { CONFIG } from "./data/config";
import { getChip } from "./data/chips";
import { getCity } from "./data/cities";
import { CHEAP_TIPS, PREMIUM_TIPS } from "./data/tips";

export function rollTips(state: GameState, rng: Rng): GameState {
  if (!rng.chance(CONFIG.tipChance)) {
    return { ...state, tips: [] };
  }

  const chipId = rng.pick(state.chipIds);
  const cheap = rng.chance(0.5);
  const f = cheap
    ? rng.float(CONFIG.tipCheapMin, CONFIG.tipCheapMax)
    : rng.float(CONFIG.tipPremiumMin, CONFIG.tipPremiumMax);

  const template = rng.pick(cheap ? CHEAP_TIPS : PREMIUM_TIPS);

  const oldPrice = state.market[chipId].price;
  const newPrice = Math.max(1, Math.round(oldPrice * f));

  const market: Record<string, MarketEntry> = {
    ...state.market,
    [chipId]: { ...state.market[chipId], price: newPrice },
  };

  const message = template
    .replaceAll("{chip}", getChip(chipId).name)
    .replaceAll("{city}", getCity(state.currentCityId).shortName);

  const tips: MarketTip[] = [{ chipId, cheap, message }];

  return { ...state, market, tips };
}
