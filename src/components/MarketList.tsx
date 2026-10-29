// Market list component: shows all chips, prices, held quantities, and trade buttons.
import type { JSX } from "react";
import styles from "./AiWars.module.css";
import type { GameState } from "@/game/types";
import { getChip } from "@/game/data/chips";
import { maxBuy, maxSell } from "@/game/market";
import { formatMoney } from "@/game/format";

export interface MarketListProps {
  game: GameState;
  onTrade(chipId: string, mode: "buy" | "sell"): void;
}

export function MarketList(props: MarketListProps): JSX.Element {
  const { game, onTrade } = props;

  return (
    <section className={styles.market} aria-label="Market">
      <div className={styles.marketHead}>
        <h2>Chip market</h2>
        <span>Buy low. Sell high.</span>
      </div>
      <ul>
        {game.chipIds.map((id) => {
          const chip = getChip(id);
          const entry = game.market[id];
          if (!entry) return null;

          const held = game.inventory[id] ?? 0;
          const stored = game.dataCenterChips[id] ?? 0;
          const avgCost = game.avgCost[id] ?? 0;
          const buyBlocked = entry.buyBlocked;
          const tip = game.tips.find((t) => t.chipId === id);

          return (
            <li key={id} className={styles.chipRow}>
              <button
                type="button"
                className={styles.chipInfo}
                onClick={() => onTrade(id, held > 0 ? "sell" : "buy")}
                aria-label={`${chip.name} details`}
              >
                <span className={styles.chipName}>{chip.name}</span>
                <span className={styles.chipPrice}>{formatMoney(entry.price)}</span>
                {held + stored > 0 ? <span className={styles.avg}>{`Avg ${formatMoney(Math.round(avgCost))}`}</span> : null}
                {tip ? (
                  <span className={tip.cheap ? styles.good : styles.bad}>
                    {tip.cheap ? "▼ deal" : "▲ hot"}
                  </span>
                ) : null}
              </button>
              <div className={styles.held}>
                {held > 0 || stored > 0 ? (
                  <>
                    <span className={styles.good}>{`${held} held`}</span>
                    {stored > 0 && <span>{`${stored} stored`}</span>}
                  </>
                ) : (
                  <span>None held</span>
                )}
                {buyBlocked ? <span className={styles.bad}>sanctioned</span> : null}
              </div>
              <button
                type="button"
                aria-label={`Buy ${chip.name}`}
                disabled={maxBuy(game, id) === 0}
                onClick={() => onTrade(id, "buy")}
              >
                BUY
              </button>
              <button
                type="button"
                aria-label={`Sell ${chip.name}`}
                disabled={maxSell(game, id) === 0}
                onClick={() => onTrade(id, "sell")}
              >
                SELL
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
