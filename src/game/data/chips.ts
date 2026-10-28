// Static chip definitions. 13 chips: 4 budget, 5 mid, 4 premium.

import type { ChipDef } from "../types";

export const CHIPS: readonly ChipDef[] = [
  // budget
  { id: "shreds", name: "Shreds", tier: "budget", minPrice: 15, maxPrice: 60 },
  { id: "low-performance-unit", name: "LowPerformanceUnit", tier: "budget", minPrice: 40, maxPrice: 180 },
  { id: "onchip", name: "Onchip", tier: "budget", minPrice: 90, maxPrice: 400 },
  { id: "forgetful-memory", name: "ForgetfulMemory", tier: "budget", minPrice: 150, maxPrice: 600 },
  // mid
  { id: "fakeasic", name: "FakeASIC", tier: "mid", minPrice: 500, maxPrice: 1500 },
  { id: "descend", name: "Descend", tier: "mid", minPrice: 700, maxPrice: 2200 },
  { id: "flopster", name: "Flopster", tier: "mid", minPrice: 1000, maxPrice: 3000 },
  { id: "drainium", name: "Drainium", tier: "mid", minPrice: 1500, maxPrice: 4500 },
  { id: "fauxfoundry", name: "FauxFoundry", tier: "mid", minPrice: 2000, maxPrice: 6000 },
  // premium
  { id: "extinct", name: "Extinct", tier: "premium", minPrice: 4000, maxPrice: 12000 },
  { id: "ironwoodworm", name: "Ironwoodworm", tier: "premium", minPrice: 6000, maxPrice: 18000 },
  { id: "vera-ruine", name: "Vera Ruine", tier: "premium", minPrice: 9000, maxPrice: 28000 },
  { id: "buckwell", name: "Buckwell", tier: "premium", minPrice: 14000, maxPrice: 40000 },
] as const;

export function getChip(id: string): ChipDef {
  const chip = CHIPS.find((c) => c.id === id);
  if (!chip) {
    throw new Error(`Unknown chip id: ${id}`);
  }
  return chip;
}
