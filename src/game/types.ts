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

export type RiskKind = "gpuMeltdown" | "ransomware" | "trafficSurge";

export interface UptimeRisk {
  kind: RiskKind;
  message: string;
  downtime: number;            // uptime points lost if it hits
  attempts: number;            // token-reset attempts made so far
  outcome: "pending" | "avoided" | "down";
}

export interface MarketTip {
  chipId: string;
  cheap: boolean;              // true = discount, false = premium
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
  avgCost: Record<string, number>;                 // chipId -> average price paid per pallet (float, 0 if none held)
  dataCenter: number;          // banked dollars, untouched by risks
  dataCenterUsed: boolean;     // one deposit/withdrawal per day; reset on travel
  uptime: number;              // 0..100
  tips: MarketTip[];           // this visit's market tips
  cityBias: Record<string, Record<string, number>>; // cityId -> chipId -> multiplier in [0.8, 1.2]
  chipModifier: Record<string, number>;            // chipId -> permanent multiplier, starts at 1
  market: Record<string, MarketEntry>;             // chipId -> current city's offer
  pendingEvent: GameEvent | null;
  pendingRisk: UptimeRisk | null;
  status: "playing" | "ended";
  endReason: "ipo" | "uptime" | null;
}
