// Core game types and interfaces.

export type ChipTier = "budget" | "mid" | "premium";

export interface ChipDef {
  id: string;
  name: string;
  tier: ChipTier;
  minPrice: number;
  maxPrice: number;
}

export interface CityDef {
  id: string;
  name: string;
  shortName: string;
}

export type EventKind =
  | "palletsMissing"
  | "competitorVram"
  | "quantization"
  | "sanctions"
  | "customs"
  | "fellOffTruck"
  | "hypeSpike"
  | "fireSale";

export interface GameEvent {
  kind: EventKind;
  good: boolean;
  message: string;
}

export interface MarketEntry {
  price: number;
  stock: number;
  buyBlocked: boolean;
}

export interface GameState {
  seed: number;
  rngState: number;
  company: string;
  interestEnabled: boolean;
  day: number;                 // 1..30 while playing
  cityIds: string[];           // the 6 cities in this game
  currentCityId: string;
  chipIds: string[];           // the 12 chips in this game
  cash: number;                // integer dollars
  debt: number;                // integer dollars
  inventory: Record<string, number>;               // chipId -> pallets held (0 if none)
  cityBias: Record<string, Record<string, number>>; // cityId -> chipId -> multiplier in [0.8, 1.2]
  chipModifier: Record<string, number>;            // chipId -> permanent multiplier, starts at 1
  market: Record<string, MarketEntry>;             // chipId -> current city's offer
  pendingEvent: GameEvent | null;
  status: "playing" | "ended";
}
