import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiWars } from "./AiWars";
import { newGame, buy, travel, dismissEvent, endMessage, profit } from "@/game/game";
import { maxBuy } from "@/game/market";
import { formatMoney } from "@/game/format";
import { getChip } from "@/game/data/chips";
import { CONFIG } from "@/game/data/config";
import type { GameState } from "@/game/types";
import type { HighScore, KeyValueStore } from "@/game/highscores";

const SEED = 7;
const COMPANY = "SMuC";

class MapStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function savedScores(store: MapStore): HighScore[] {
  const raw = store.map.get(CONFIG.highScoreKey);
  return raw === undefined ? [] : (JSON.parse(raw) as HighScore[]);
}

// The engine-side twin of playToEnd: dismiss, then travel to the first other city in cityIds order.
function simulateToEnd(): GameState {
  let g = newGame({ seed: SEED, company: COMPANY, interestEnabled: false });
  while (g.status === "playing") {
    g = dismissEvent(g);
    const next = g.cityIds.find((id) => id !== g.currentCityId);
    if (next === undefined) throw new Error("no city");
    g = travel(g, next);
  }
  return g;
}

const money = (n: number): string => formatMoney(n).replace("$", "\\$");

async function startGame(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.selectOptions(screen.getByLabelText("Company"), COMPANY);
  await user.click(screen.getByRole("button", { name: "Start New Game" }));
}

// Dismiss events and travel to the first enabled city until the end screen shows.
async function playToEnd(user: ReturnType<typeof userEvent.setup>): Promise<number> {
  let travels = 0;
  for (let i = 0; i < 100; i++) {
    if (screen.queryByRole("heading", { name: "Game over" })) return travels;
    const dialog = screen.queryByRole("dialog", { name: "Event" });
    if (dialog) {
      await user.click(within(dialog).getByRole("button", { name: "OK" }));
      continue;
    }
    const bar = screen.getByRole("navigation", { name: "Travel" });
    const next = within(bar).getAllByRole("button").find((b) => !b.hasAttribute("disabled"));
    if (!next) throw new Error("no enabled travel button");
    await user.click(next);
    travels++;
  }
  throw new Error("game did not end");
}

describe("AiWars", () => {
  it("shows the splash with the story for the chosen company", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    expect(screen.getByRole("heading", { name: "AI WARS!" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Company"), COMPANY);
    expect(screen.getByText(new RegExp(`AI tech bro at ${COMPANY}`))).toBeInTheDocument();
    expect(screen.getByLabelText("Loan interest")).not.toBeChecked();
  });

  it("starts the seeded game and shows header, market and empty racks", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    expect(screen.getByText(/^Day 1\/30 · .+ · Cash \$5,500 · Debt \$5,500$/)).toBeInTheDocument();
    const game = newGame({ seed: SEED, company: COMPANY, interestEnabled: false });
    const market = screen.getByRole("region", { name: "Market" });
    for (const id of game.chipIds) {
      expect(within(market).getByText(getChip(id).name)).toBeInTheDocument();
    }
    expect(within(screen.getByRole("region", { name: "Your racks" })).getByText("Your racks are empty.")).toBeInTheDocument();
  });

  it("buys the max of the cheapest chip and shows it in the racks", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    const game = newGame({ seed: SEED, company: COMPANY, interestEnabled: false });
    const cheapest = [...game.chipIds].sort((a, b) => game.market[a].price - game.market[b].price)[0];
    const name = getChip(cheapest).name;
    const after = buy(game, cheapest, maxBuy(game, cheapest));

    const buyButton = screen.getByRole("button", { name: `Buy ${name}` });
    expect(buyButton).toBeDisabled();
    await user.click(screen.getByRole("button", { name: `Max Buy quantity ${name}` }));
    await user.click(buyButton);

    expect(screen.getByText(new RegExp(`Cash ${money(after.cash)} ·`))).toBeInTheDocument();
    const racks = screen.getByRole("region", { name: "Your racks" });
    expect(within(racks).getByText(name)).toBeInTheDocument();
    expect(within(racks).getByRole("button", { name: `Sell ${name}` })).toBeInTheDocument();
  });

  it("disables the current city in the travel bar", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    const buttons = within(screen.getByRole("navigation", { name: "Travel" })).getAllByRole("button");
    expect(buttons).toHaveLength(CONFIG.citiesPerGame);
    expect(buttons.filter((b) => b.hasAttribute("disabled"))).toHaveLength(1);
  });

  it("plays 30 travels to the end screen, saves one high score and can start over", async () => {
    const user = userEvent.setup();
    const store = new MapStore();
    render(<AiWars seed={SEED} store={store} />);
    await startGame(user);

    expect(await playToEnd(user)).toBe(CONFIG.days);
    const end = simulateToEnd();
    expect(
      screen.getByText(new RegExp(`^Final cash ${money(end.cash)} · Debt ${money(end.debt)} · Profit ${money(profit(end))}$`))
    ).toBeInTheDocument();
    expect(screen.getByText(endMessage(end))).toBeInTheDocument();

    const scores = savedScores(store);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ company: COMPANY, cash: end.cash, profit: profit(end) });
    expect(within(screen.getByRole("table", { name: "High scores" })).getByText(COMPANY)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start New Game" }));
    expect(screen.getByRole("heading", { name: "AI WARS!" })).toBeInTheDocument();
  });

  it("shows the last-day banner on day 30", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    for (let i = 0; i < 100 && !screen.queryByText(/^Day 30\/30/); i++) {
      const dialog = screen.queryByRole("dialog", { name: "Event" });
      if (dialog) {
        await user.click(within(dialog).getByRole("button", { name: "OK" }));
        continue;
      }
      const bar = screen.getByRole("navigation", { name: "Travel" });
      const next = within(bar).getAllByRole("button").find((b) => !b.hasAttribute("disabled"));
      if (next) await user.click(next);
    }
    expect(screen.getByRole("status")).toHaveTextContent("Last day before the IPO — unsold chips are worth nothing.");
  });

  it("finishes a game with storage unavailable and still lists this game's score", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    await playToEnd(user);
    expect(within(screen.getByRole("table", { name: "High scores" })).getByText(COMPANY)).toBeInTheDocument();
  });
});
