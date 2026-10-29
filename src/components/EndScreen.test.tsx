import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { EndScreen } from "./EndScreen";
import { makeState } from "@/game/testUtils";
import type { HighScore } from "@/game/highscores";

describe("EndScreen high scores", () => {
  it("shows a Level column with the label, or a dash for old scores", () => {
    const scores: HighScore[] = [
      { company: "Lentil", cash: 9000, profit: 3500, date: "2026-10-29", difficulty: "brutal" },
      { company: "Frugal", cash: 6000, profit: 500, date: "2026-10-28" },
    ];
    render(<EndScreen game={makeState({ status: "ended", endReason: "ipo" })} scores={scores} onNewGame={() => {}} />);
    const table = screen.getByRole("table", { name: "High scores" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "#", "Company", "Level", "Cash", "Net worth",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Brutal")).toBeTruthy();
    expect(within(rows[1]).getByText("—")).toBeTruthy();
  });

  it("empty table spans all five columns", () => {
    render(<EndScreen game={makeState({ status: "ended", endReason: "ipo" })} scores={[]} onNewGame={() => {}} />);
    expect(screen.getByText("No scores yet").getAttribute("colspan")).toBe("5");
  });
});
