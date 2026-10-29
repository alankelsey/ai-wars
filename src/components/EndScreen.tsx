// End game screen: summary, net worth, and high scores table.
import type { JSX } from "react";
import styles from "./AiWars.module.css";
import type { GameState } from "@/game/types";
import type { HighScore } from "@/game/highscores";
import { endMessage, netWorth } from "@/game/game";
import { formatMoney } from "@/game/format";
import { getDifficulty } from "@/game/data/difficulty";

export interface EndScreenProps {
  game: GameState;
  scores: readonly HighScore[];
  onNewGame(): void;
}

export function EndScreen(props: EndScreenProps): JSX.Element {
  const { game, scores, onNewGame } = props;

  return (
    <main className={`${styles.screen} ${styles.end}`}>
      <h1>Game over</h1>
      <p>{endMessage(game)}</p>
      <p>{`Final cash ${formatMoney(game.cash + game.dataCenter)} · Debt ${formatMoney(game.debt)} · Net worth ${formatMoney(netWorth(game))}`}</p>
      <table className={styles.table} aria-label="High scores">
        <thead>
          <tr>
            <th>#</th>
            <th>Company</th>
            <th>Level</th>
            <th>Cash</th>
            <th>Net worth</th>
          </tr>
        </thead>
        <tbody>
          {scores.length === 0 ? (
            <tr>
              <td colSpan={5}>No scores yet</td>
            </tr>
          ) : (
            scores.map((score, i) => (
              <tr key={`${i}-${score.date}`}>
                <td>{i + 1}</td>
                <td>{score.company}</td>
                <td>{score.difficulty ? getDifficulty(score.difficulty).label : "—"}</td>
                <td className={styles.num}>{formatMoney(score.cash)}</td>
                <td className={styles.num}>{formatMoney(score.profit)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <button type="button" onClick={onNewGame}>Start New Game</button>
      <nav className={styles.links} aria-label="Links">
        <a href="#">GitHub</a>
        <a href="#">X</a>
        <a href="#">Bluesky</a>
      </nav>
    </main>
  );
}
