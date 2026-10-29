"use client";

import { useReducer, useState, type JSX } from "react";
import { appReducer, initialAppState, type AppAction } from "./gameReducer";
import { Splash } from "./Splash";
import { GameScreen } from "./GameScreen";
import { EndScreen } from "./EndScreen";
import type { GameState } from "@/game/types";
import { netWorth } from "@/game/game";
import { addHighScore, loadHighScores, saveHighScores, type HighScore, type KeyValueStore } from "@/game/highscores";

export interface AiWarsProps {
  seed?: number;
  store?: KeyValueStore | null;
}

function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function recordScore(store: KeyValueStore | null, game: GameState): HighScore[] {
  const list = addHighScore(loadHighScores(store), {
    company: game.company,
    cash: game.cash + game.dataCenter,
    profit: netWorth(game),
    date: new Date().toISOString(),
    difficulty: game.difficulty,
  });
  saveHighScores(store, list);
  return list;
}

export function AiWars({ seed, store }: AiWarsProps): JSX.Element {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [scores, setScores] = useState<readonly HighScore[]>([]);

  // Save the high score in the handler of the action that ends the game, not in an effect.
  function act(action: AppAction): void {
    const next = appReducer(state, action);
    const wasPlaying = state.screen === "game" && state.game.status === "playing";
    if (wasPlaying && next.screen === "game" && next.game.status === "ended") {
      setScores(recordScore(store !== undefined ? store : browserStore(), next.game));
    }
    dispatch(action);
  }

  if (state.screen === "splash") {
    return (
      <Splash
        onStart={(company, interestEnabled, difficulty) =>
          act({ type: "start", seed: seed ?? Math.floor(Math.random() * 2 ** 32), company, interestEnabled, difficulty })
        }
      />
    );
  }
  if (state.game.status === "ended") {
    return <EndScreen game={state.game} scores={scores} onNewGame={() => act({ type: "reset" })} />;
  }
  return <GameScreen game={state.game} dispatch={act} />;
}
