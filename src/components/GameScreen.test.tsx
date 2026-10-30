import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCity } from "@/game/data/cities";
import { CONFIG } from "@/game/data/config";
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

describe("new game link", () => {
  it("sits between the city name and the day count", () => {
    const game = makeState();
    render(<GameScreen game={game} dispatch={() => {}} />);
    const city = screen.getByRole("heading", { level: 2, name: getCity(game.currentCityId).shortName });
    const link = screen.getByRole("button", { name: "New game" });
    const day = screen.getByText(`Day ${game.day}/${CONFIG.days}`);
    expect(city.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(day) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("asks first, then quits to the start screen with a reset", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<GameScreen game={makeState()} dispatch={dispatch} />);
    await user.click(screen.getByRole("button", { name: "New game" }));
    expect(dispatch).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "New game" });
    expect(within(dialog).getByRole("heading", { name: "Are you sure?" })).toBeTruthy();
    expect(within(dialog).getByText("Quit this game and start a new one? This run won't count toward high scores.")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Yes, start over" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "reset" });
  });

  it("Keep playing closes the question and changes nothing", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<GameScreen game={makeState()} dispatch={dispatch} />);
    await user.click(screen.getByRole("button", { name: "New game" }));
    const keep = within(screen.getByRole("dialog", { name: "New game" })).getByRole("button", { name: "Keep playing" });
    expect(document.activeElement).toBe(keep); // the safe choice has focus
    await user.click(keep);
    expect(screen.queryByRole("dialog", { name: "New game" })).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
