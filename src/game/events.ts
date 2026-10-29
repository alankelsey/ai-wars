// Events: bad/good market disruptions (pallets missing, sanctions, hype spikes, etc.).
import type { GameState, EventKind, GameEvent } from "./types";
import type { Rng } from "./rng";
import { getDifficulty } from "./data/difficulty";
import { formatMoney } from "./format";
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

  const d = getDifficulty(state.difficulty);

  const hasPallets = state.chipIds.some(
    (id) => (state.inventory[id] ?? 0) > 0
  );
  const badPicks: readonly EventKind[] = hasPallets
    ? BAD_KINDS
    : BAD_KINDS.filter((k) => k !== "palletsMissing");

  let kind: EventKind | null = null;

  if (rng.chance(d.badEventChance)) {
    kind = rng.pick(badPicks);
  } else if (rng.chance(d.goodEventChance)) {
    kind = rng.pick(GOOD_KINDS);
  }

  // No event
  if (kind === null) {
    return { ...state, pendingEvent: null };
  }

  const newInventory = { ...state.inventory };
  const newAvgCost = { ...state.avgCost };
  const newMarket = { ...state.market };
  const newChipModifier = { ...state.chipModifier };
  let newCash = state.cash;

  let message = "";

  switch (kind) {
    case "palletsMissing": {
      const base = rng.float(d.palletLossPctMin, d.palletLossPctMax);
      const heldIds = state.chipIds.filter((id) => (newInventory[id] ?? 0) > 0);
      const types = heldIds.length;
      const pct = Math.min(d.palletLossPctCap, base + d.palletLossPerExtraType * (types - 1));
      const parts: string[] = [];
      for (const id of heldIds) {
        const held = newInventory[id] ?? 0;
        const lost = Math.min(held, Math.max(1, Math.ceil(held * pct)));
        newInventory[id] = held - lost;
        if (newInventory[id] === 0 && (state.dataCenterChips[id] ?? 0) === 0) {
          newAvgCost[id] = 0;
        }
        parts.push(`${lost} ${getChip(id).name}`);
      }
      message = `Pallets went missing in transit! You lost ${Math.round(pct * 100)}% of your stock: ${parts.join(", ")}.`;
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
      const finePct = rng.float(d.finePctMin, d.finePctMax);
      const fine = Math.min(newCash, Math.ceil(newCash * finePct));
      newCash -= fine;
      message = `Sanctioned by the local government! ${getChip(chip).name} can't be bought here and you paid a ${formatMoney(fine)} fine.`;
      break;
    }

    case "customs": {
      const finePct = rng.float(d.finePctMin, d.finePctMax);
      const fine = Math.min(newCash, Math.ceil(newCash * finePct));
      newCash -= fine;
      message = `Customs shakedown at the border. You lost ${formatMoney(fine)}.`;
      break;
    }

    case "fellOffTruck": {
      const chip = rng.pick(state.chipIds);
      const n = rng.int(d.truckMin, d.truckMax);
      const held = newInventory[chip] ?? 0;
      const owned = held + (state.dataCenterChips[chip] ?? 0);
      newInventory[chip] = held + n;
      const avg = state.avgCost[chip];
      newAvgCost[chip] = (avg * owned) / (owned + n);
      message = `A pallet fell off a truck... ${n} pallet(s) of ${getChip(chip).name} are now yours.`;
      break;
    }

    case "hypeSpike": {
      const chip = rng.pick(state.chipIds);
      const f = rng.float(d.hypeMin, d.hypeMax);
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
    avgCost: newAvgCost,
    market: newMarket,
    chipModifier: newChipModifier,
    pendingEvent,
  };
}
