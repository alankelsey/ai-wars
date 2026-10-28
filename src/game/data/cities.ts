// Static city definitions. 10 cities.

import type { CityDef } from "../types";

export const CITIES: readonly CityDef[] = [
  { id: "santa-clara", name: "Santa Clara, California, USA", shortName: "Santa Clara" },
  { id: "hsinchu", name: "Hsinchu, Taiwan", shortName: "Hsinchu" },
  { id: "mountain-view", name: "Mountain View, California, USA", shortName: "Mountain View" },
  { id: "sunnyvale", name: "Sunnyvale, California, USA", shortName: "Sunnyvale" },
  { id: "seattle", name: "Seattle, Washington, USA", shortName: "Seattle" },
  { id: "suwon", name: "Suwon, South Korea", shortName: "Suwon" },
  { id: "hokkaido", name: "Hokkaido, Japan", shortName: "Hokkaido" },
  { id: "shenzhen", name: "Shenzhen, China", shortName: "Shenzhen" },
  { id: "shanghai", name: "Shanghai, China", shortName: "Shanghai" },
  { id: "beijing", name: "Beijing, China", shortName: "Beijing" },
] as const;

export function getCity(id: string): CityDef {
  const city = CITIES.find((c) => c.id === id);
  if (!city) {
    throw new Error(`Unknown city id: ${id}`);
  }
  return city;
}
