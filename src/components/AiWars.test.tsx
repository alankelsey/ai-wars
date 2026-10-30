import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiWars } from "./AiWars";
import { newGame, buy, travel, dismissEvent, endMessage, netWorth } from "@/game/game";
import { acceptDowntime, dismissRisk } from "@/game/risks";
import { maxBuy } from "@/game/market";
import { formatMoney } from "@/game/format";
import { getChip } from "@/game/data/chips";
import { getCity } from "@/game/data/cities";
import { CONFIG } from "@/game/data/config";
import type { GameState } from "@/game/types";
import type { HighScore, KeyValueStore } from "@/game/highscores";

const SEED = 7;
const COMPANY = "SMuC";
type User = ReturnType<typeof userEvent.setup>;

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

function startState(seed = SEED): GameState {
  return newGame({ seed, company: COMPANY, interestEnabled: false });
}

// The engine-side twin of playToEnd: dismiss events, take any downtime, travel to the first other city.
function simulateToEnd(): GameState {
  let g = startState();
  while (g.status === "playing") {
    g = dismissEvent(g);
    if (g.pendingRisk) {
      g = dismissRisk(acceptDowntime(g));
      continue;
    }
    const next = g.cityIds.find((id) => id !== g.currentCityId);
    if (next === undefined) throw new Error("no city");
    g = travel(g, next);
  }
  return g;
}

const money = (n: number): string => formatMoney(n).replace("$", "\\$");

// Text of the <dd> that follows the <dt> named `name` in the stats panel.
function stat(name: string): string {
  const stats = screen.getByRole("region", { name: "Stats" });
  const dt = within(stats).getByText(name, { selector: "dt" });
  return dt.nextElementSibling?.textContent ?? "";
}

async function startGame(user: User): Promise<void> {
  await user.selectOptions(screen.getByLabelText("Company"), COMPANY);
  await user.click(screen.getByRole("button", { name: "Start New Game" }));
}

// Answer an open dialog the same way simulateToEnd does.
async function answerDialog(user: User): Promise<boolean> {
  const event = screen.queryByRole("dialog", { name: "Event" });
  if (event) {
    await user.click(within(event).getByRole("button", { name: "OK" }));
    return true;
  }
  const risk = screen.queryByRole("dialog", { name: "Uptime risk" });
  if (risk) {
    const take = within(risk).queryByRole("button", { name: "Take the downtime" });
    await user.click(take ?? within(risk).getByRole("button", { name: "OK" }));
    return true;
  }
  return false;
}

async function travelOnce(user: User): Promise<void> {
  const bar = screen.getByRole("navigation", { name: "Travel" });
  const next = within(bar).getAllByRole("button").find((b) => !b.hasAttribute("disabled"));
  if (!next) throw new Error("no enabled travel button");
  await user.click(next);
}

async function playToEnd(user: User): Promise<number> {
  let travels = 0;
  for (let i = 0; i < 200; i++) {
    if (screen.queryByRole("heading", { name: "Game over" })) return travels;
    if (await answerDialog(user)) continue;
    await travelOnce(user);
    travels++;
  }
  throw new Error("game did not end");
}

describe("AiWars", () => {
  it("New game mid-game goes back to the start screen without saving a score", async () => {
    const user = userEvent.setup();
    const saved: string[] = [];
    const store: KeyValueStore = { getItem: () => null, setItem: (_k: string, v: string) => { saved.push(v); } };
    render(<AiWars seed={SEED} store={store} />);
    await startGame(user);
    await user.click(screen.getByRole("button", { name: "New game" }));
    expect(screen.getByRole("button", { name: "Start New Game" })).toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it("shows the splash with the story for the chosen company", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    expect(screen.getByRole("heading", { name: "AI WARS!" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Company"), COMPANY);
    expect(screen.getByText(new RegExp(`AI tech bro/bae at ${COMPANY}`))).toBeInTheDocument();
    expect(screen.getByLabelText("Loan interest")).not.toBeChecked();
  });

  it("shows city, day and money totals together in the stats panel", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    const game = startState();
    const stats = screen.getByRole("region", { name: "Stats" });
    expect(within(stats).getByRole("heading", { name: getCity(game.currentCityId).shortName })).toBeInTheDocument();
    expect(within(stats).getByText("Day 1/30")).toBeInTheDocument();
    expect(stat("Cash")).toBe("$5,500");
    expect(stat("Debt")).toBe("$5,500");
    expect(stat("Net worth")).toBe("$0");
    expect(stat("Data center")).toMatch(/^\$0/);
    expect(within(stats).getByRole("progressbar", { name: "Uptime" })).toHaveAttribute("aria-valuenow", "100");
  });

  it("lists every chip in one market list with nothing held", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    const market = screen.getByRole("region", { name: "Market" });
    const game = startState();
    for (const id of game.chipIds) {
      expect(within(market).getByText(getChip(id).name)).toBeInTheDocument();
    }
    expect(within(market).getAllByText("None held")).toHaveLength(game.chipIds.length);
  });

  it("buys the max of the cheapest chip through the trade modal and shows held + average", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    const game = startState();
    const cheapest = [...game.chipIds].sort((a, b) => game.market[a].price - game.market[b].price)[0];
    const name = getChip(cheapest).name;
    const max = maxBuy(game, cheapest);
    const after = buy(game, cheapest, max);

    await user.click(screen.getByRole("button", { name: `Buy ${name}` }));
    const modal = screen.getByRole("dialog", { name: `Buy ${name}` });
    await user.click(within(modal).getByRole("button", { name: "Max Quantity" }));
    await user.click(within(modal).getByRole("button", { name: `Buy ${max} ${name}` }));

    expect(screen.queryByRole("dialog", { name: `Buy ${name}` })).not.toBeInTheDocument();
    expect(stat("Cash")).toBe(formatMoney(after.cash));
    const market = screen.getByRole("region", { name: "Market" });
    expect(within(market).getByText(`${max} held`)).toBeInTheDocument();
    expect(within(market).getByText(`Avg ${formatMoney(game.market[cheapest].price)}`)).toBeInTheDocument();
  });

  it("closes the trade modal without trading", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    const name = getChip(startState().chipIds[0]).name;
    await user.click(screen.getByRole("button", { name: `${name} details` }));
    const modal = screen.getByRole("dialog", { name: `Buy ${name}` });
    await user.click(within(modal).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stat("Cash")).toBe("$5,500");
  });

  it("deposits into the data center once per day", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);

    await user.click(screen.getByRole("button", { name: "Open data center" }));
    let modal = screen.getByRole("dialog", { name: "Data center" });
    const deposit = within(modal).getByRole("region", { name: "Deposit" });
    await user.click(within(deposit).getByRole("button", { name: "Max Deposit amount" }));
    await user.click(within(deposit).getByRole("button", { name: "Deposit" }));

    expect(stat("Cash")).toBe("$0");
    expect(stat("Data center")).toMatch(/^\$5,500/);
    expect(stat("Net worth")).toBe("$0");

    await user.click(screen.getByRole("button", { name: "Open data center" }));
    modal = screen.getByRole("dialog", { name: "Data center" });
    expect(within(modal).getByRole("status")).toHaveTextContent("Already used today");
    const withdraw = within(modal).getByRole("region", { name: "Withdraw" });
    expect(within(withdraw).getByRole("button", { name: "Withdraw" })).toBeDisabled();
  });

  it("shows market tips as dismissible banners", async () => {
    let tipSeed = 1;
    while (startState(tipSeed).tips.length === 0) tipSeed++;
    const tip = startState(tipSeed).tips[0];
    const user = userEvent.setup();
    render(<AiWars seed={tipSeed} store={null} />);
    await startGame(user);
    expect(screen.getByRole("note")).toHaveTextContent(tip.message);
    await user.click(screen.getByRole("button", { name: "Dismiss tip" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("disables the current city in the travel bar", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    const buttons = within(screen.getByRole("navigation", { name: "Travel" })).getAllByRole("button");
    expect(buttons).toHaveLength(CONFIG.citiesPerGame);
    expect(buttons.filter((b) => b.hasAttribute("disabled"))).toHaveLength(1);
  });

  it("plays to the end screen, saves one high score and can start over", async () => {
    const user = userEvent.setup();
    const store = new MapStore();
    render(<AiWars seed={SEED} store={store} />);
    await startGame(user);
    await playToEnd(user);

    const end = simulateToEnd();
    expect(
      screen.getByText(
        new RegExp(`^Final cash ${money(end.cash + end.dataCenter)} · Debt ${money(end.debt)} · Net worth ${money(netWorth(end))}$`)
      )
    ).toBeInTheDocument();
    expect(screen.getByText(endMessage(end))).toBeInTheDocument();

    const scores = savedScores(store);
    expect(scores).toHaveLength(1);
    expect(scores[0]).toMatchObject({ company: COMPANY, cash: end.cash + end.dataCenter, profit: netWorth(end) });
    expect(within(screen.getByRole("table", { name: "High scores" })).getByText(COMPANY)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start New Game" }));
    expect(screen.getByRole("heading", { name: "AI WARS!" })).toBeInTheDocument();
  });

  it("finishes a game with storage unavailable and still lists this game's score", async () => {
    const user = userEvent.setup();
    render(<AiWars seed={SEED} store={null} />);
    await startGame(user);
    await playToEnd(user);
    expect(within(screen.getByRole("table", { name: "High scores" })).getByText(COMPANY)).toBeInTheDocument();
  });
});
