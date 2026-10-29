import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameScreen } from "./GameScreen";
import { makeState } from "@/game/testUtils";
import type { GameState, UptimeRisk } from "@/game/types";

function withRisk(outcome: UptimeRisk["outcome"]): GameState {
  const base = makeState();
  return {
    ...base,
    uptime: 80,
    pendingRisk: { kind: "gpuMeltdown", message: "GPUs on fire.", downtime: 20, attempts: 1, outcome },
  };
}

describe("GameScreen risk result", () => {
  it("says token resets made customers forget the outage when avoided", () => {
    render(<GameScreen game={withRisk("avoided")} dispatch={() => {}} />);
    expect(
      screen.getByText("The token resets made customers forget about the outage. Uptime preserved."),
    ).toBeTruthy();
  });

  it("reports the new uptime when the downtime hits", () => {
    render(<GameScreen game={withRisk("down")} dispatch={() => {}} />);
    expect(screen.getByText("Downtime hit. Uptime is now 80%.")).toBeTruthy();
  });
});

describe("last-day warning", () => {
  const text = "Last day before the IPO — unsold chips are worth nothing.";
  it("shows on Normal", () => {
    render(<GameScreen game={{ ...makeState(), day: 30, difficulty: "normal" }} dispatch={() => {}} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
  it("is hidden on Hard and Brutal", () => {
    render(<GameScreen game={{ ...makeState(), day: 30, difficulty: "hard" }} dispatch={() => {}} />);
    render(<GameScreen game={{ ...makeState(), day: 30, difficulty: "brutal" }} dispatch={() => {}} />);
    expect(screen.queryByText(text)).toBeNull();
  });
});

describe("market list stored chips", () => {
  it("shows stored pallets next to held ones", () => {
    const base = makeState();
    const id = base.chipIds[0];
    const game: GameState = {
      ...base,
      market: Object.fromEntries(base.chipIds.map((c) => [c, { price: 100, stock: 10, buyBlocked: false }])),
      inventory: { ...base.inventory, [id]: 2 },
      dataCenterChips: { ...base.dataCenterChips, [id]: 5 },
    };
    render(<GameScreen game={game} dispatch={() => {}} />);
    expect(screen.getByText("2 held")).toBeTruthy();
    expect(screen.getByText("5 stored")).toBeTruthy();
  });
});
