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
