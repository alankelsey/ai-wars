import type { Difficulty } from "../types";

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  badEventChance: number;
  goodEventChance: number;
  riskChance: number;
  finePctMin: number;
  finePctMax: number;
  palletLossPctMin: number;
  palletLossPctMax: number;
  palletLossPerExtraType: number;
  palletLossPctCap: number;
  truckMin: number;
  truckMax: number;
  hypeMin: number;
  hypeMax: number;
}

export const DEFAULT_DIFFICULTY: Difficulty = "hard";

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: "normal",
    label: "Normal",
    badEventChance: 0.22,
    goodEventChance: 0.10,
    riskChance: 0.16,
    finePctMin: 0.03,
    finePctMax: 0.12,
    palletLossPctMin: 0.10,
    palletLossPctMax: 0.25,
    palletLossPerExtraType: 0.08,
    palletLossPctCap: 0.60,
    truckMin: 1,
    truckMax: 5,
    hypeMin: 2,
    hypeMax: 4,
  },
  {
    id: "hard",
    label: "Hard",
    badEventChance: 0.30,
    goodEventChance: 0.10,
    riskChance: 0.20,
    finePctMin: 0.05,
    finePctMax: 0.20,
    palletLossPctMin: 0.15,
    palletLossPctMax: 0.35,
    palletLossPerExtraType: 0.10,
    palletLossPctCap: 0.75,
    truckMin: 3,
    truckMax: 10,
    hypeMin: 2,
    hypeMax: 5,
  },
  {
    id: "brutal",
    label: "Brutal",
    badEventChance: 0.40,
    goodEventChance: 0.10,
    riskChance: 0.25,
    finePctMin: 0.10,
    finePctMax: 0.30,
    palletLossPctMin: 0.20,
    palletLossPctMax: 0.45,
    palletLossPerExtraType: 0.12,
    palletLossPctCap: 0.85,
    truckMin: 5,
    truckMax: 15,
    hypeMin: 2,
    hypeMax: 6,
  },
] as const;

export function getDifficulty(id: Difficulty): DifficultyDef {
  for (const d of DIFFICULTIES) {
    if (d.id === id) return d;
  }
  throw new Error(`Unknown difficulty: ${id}`);
}
