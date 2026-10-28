import type { GameState, EventKind, GameEvent } from "./types";
import type { Rng } from "./rng";
import { CONFIG } from "./data/config";
import { getChip } from "./data/chips";

const BAD_KINDS: readonly EventKind[] = [
  "palletsMissing",
  "competitorVram",
  "quantization",
  "sanctions",
  "customs",
];

const GOOD_KINDS: readonly EventKind[] = ["fellOffTruck", "hypeSpike", "fireSale"];

export function rollEvent(state: GameState, rng: Rng): GameState {
  // If there's already a pending event, don't roll again
  if (state.pendingEvent !== null) {
    return state;
  }

  const hasPallets = state.chipIds.some(
    (id) => (state.inventory[id] ?? 0) > 0
  );
  const badPicks: readonly EventKind[] = hasPallets
    ? BAD_KINDS
    : BAD_KINDS.filter((k) => k !== "palletsMissing");

  let kind: EventKind | null = null;

  if (rng.chance(CONFIG.badEventChance)) {
    kind = rng.pick(badPicks);
  } else if (rng.chance(CONFIG.goodEventChance)) {
    kind = rng.pick(GOOD_KINDS);
  }

  // No event
  if (kind === null) {
    return { ...state, pendingEvent: null };
  }

  const newInventory = { ...state.inventory };
  const newMarket = { ...state.market };
  const newChipModifier = { ...state.chipModifier };
  let newCash = state.cash;

  let message = "";

  switch (kind) {
    case "palletsMissing": {
      // Pick a chip that has >0 pallets
      const heldIds = state.chipIds.filter((id) => (newInventory[id] ?? 0) > 0);
      if (heldIds.length === 0) {
        // Fallback: just pick first chip; spec says this shouldn't happen due to filtering above
        return { ...state, pendingEvent: null };
      }
      const chip = rng.pick(heldIds);
      const held = newInventory[chip] ?? 0;
      const lossPct = rng.float(CONFIG.palletLossPctMin, CONFIG.palletLossPctMax);
      let lost = Math.min(held, Math.max(1, Math.ceil(held * lossPct)));
      // Ensure at least 1 and not more than held
      lost = Math.max(1, Math.min(lost, held));
      newInventory[chip] = held - lost;
      message = `Oh no! ${lost} pallet(s) of ${getChip(chip).name} went missing in transit.`;
      break;
    }

    case "competitorVram": {
      const chip = rng.pick(state.chipIds);
      const f = rng.float(CONFIG.vramModMin, CONFIG.vramModMax);
      newChipModifier[chip] *= f;
      const price = newMarket[chip]?.price ?? 1;
      newMarket[chip] = {
        ...newMarket[chip],
        price: Math.max(1, Math.round(price * f)),
      };
      const pct = Math.round((1 - f) * 100);
      message = `A competitor launched a card with 10x the VRAM. ${getChip(chip).name} prices crashed ${pct}%.`;
      break;
    }

    case "quantization": {
      const f = rng.float(CONFIG.quantModMin, CONFIG.quantModMax);
      for (const chip of state.chipIds) {
        newChipModifier[chip] *= f;
        const price = newMarket[chip]?.price ?? 1;
        newMarket[chip] = {
          ...newMarket[chip],
          price: Math.max(1, Math.round(price * f)),
        };
      }
      const pct = Math.round((1 - f) * 100);
      message = `A 50x quantization breakthrough lets local LLMs eat your demand. All chip prices fell ${pct}%.`;
      break;
    }

    case "sanctions": {
      const chip = rng.pick(state.chipIds);
      newMarket[chip] = { ...newMarket[chip], buyBlocked: true };
      const finePct = rng.float(CONFIG.finePctMin, CONFIG.finePctMax);
      const fine = Math.min(newCash, Math.ceil(newCash * finePct));
      newCash -= fine;
      message = `Sanctioned by the local government! ${getChip(chip).name} can't be bought here and you paid a $${fine} fine.`;
      break;
    }

    case "customs": {
      const finePct = rng.float(CONFIG.finePctMin, CONFIG.finePctMax);
      const fine = Math.min(newCash, Math.ceil(newCash * finePct));
      newCash -= fine;
      message = `Customs shakedown at the border. You lost $${fine}.`;
      break;
    }

    case "fellOffTruck": {
      const chip = rng.pick(state.chipIds);
      const n = rng.int(CONFIG.truckMin, CONFIG.truckMax);
      newInventory[chip] = (newInventory[chip] ?? 0) + n;
      message = `A pallet fell off a truck... ${n} pallet(s) of ${getChip(chip).name} are now yours.`;
      break;
    }

    case "hypeSpike": {
      const chip = rng.pick(state.chipIds);
      const f = rng.float(CONFIG.hypeMin, CONFIG.hypeMax);
      const price = newMarket[chip]?.price ?? 1;
      newMarket[chip] = { ...newMarket[chip], price: Math.max(1, Math.round(price * f)) };
      message = `Hype spike! Everyone wants ${getChip(chip).name}. Prices here are ${f.toFixed(1)}x.`;
      break;
    }

    case "fireSale": {
      const chip = rng.pick(state.chipIds);
      const f = rng.float(CONFIG.fireSaleMin, CONFIG.fireSaleMax);
      const price = newMarket[chip]?.price ?? 1;
      newMarket[chip] = { ...newMarket[chip], price: Math.max(1, Math.round(price * f)) };
      message = `Fire sale! A datacenter is dumping ${getChip(chip).name} at ${Math.round(f * 100)}% of the price.`;
      break;
    }
  }

  const pendingEvent: GameEvent = {
    kind,
    good: GOOD_KINDS.includes(kind),
    message,
  };

  return {
    ...state,
    cash: newCash,
    inventory: newInventory,
    market: newMarket,
    chipModifier: newChipModifier,
    pendingEvent,
  };
}
