import type { GameState } from "@/game/types";
import { newGame, buy, sell, travel, dismissEvent } from "@/game/game";
import { attemptTokenReset, acceptDowntime, dismissRisk } from "@/game/risks";
import { deposit, withdraw, depositChips, withdrawChips } from "@/game/datacenter";

export type AppState = { screen: "splash" } | { screen: "game"; game: GameState };
import type { Difficulty } from "@/game/types";

export type AppAction =
  | { type: "start"; seed: number; company: string; interestEnabled: boolean; difficulty: Difficulty }
  | { type: "buy"; chipId: string; qty: number }
  | { type: "sell"; chipId: string; qty: number }
  | { type: "travel"; cityId: string }
  | { type: "dismiss" }
  | { type: "tokenReset" }
  | { type: "acceptDowntime" }
  | { type: "dismissRisk" }
  | { type: "deposit"; amount: number }
  | { type: "withdraw"; amount: number }
  | { type: "depositChips"; chipId: string; qty: number }
  | { type: "withdrawChips"; chipId: string; qty: number }
  | { type: "reset" };

export const initialAppState: AppState = { screen: "splash" };

// Apply an engine step on the game screen; keep the same AppState when the engine made no change.
function step(state: AppState, apply: (game: GameState) => GameState): AppState {
  if (state.screen !== "game") return state;
  const next = apply(state.game);
  return next === state.game ? state : { screen: "game", game: next };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "start":
      return {
        screen: "game",
        game: newGame({ seed: action.seed, company: action.company, interestEnabled: action.interestEnabled, difficulty: action.difficulty }),
      };
    case "reset":
      return initialAppState;
    case "buy":
      return step(state, (g) => buy(g, action.chipId, action.qty));
    case "sell":
      return step(state, (g) => sell(g, action.chipId, action.qty));
    case "travel":
      return step(state, (g) => travel(g, action.cityId));
    case "dismiss":
      return step(state, dismissEvent);
    case "tokenReset":
      return step(state, attemptTokenReset);
    case "acceptDowntime":
      return step(state, acceptDowntime);
    case "dismissRisk":
      return step(state, dismissRisk);
    case "deposit":
      return step(state, (g) => deposit(g, action.amount));
    case "withdraw":
      return step(state, (g) => withdraw(g, action.amount));
    case "depositChips":
      return step(state, (g) => depositChips(g, action.chipId, action.qty));
    case "withdrawChips":
      return step(state, (g) => withdrawChips(g, action.chipId, action.qty));
  }
}
