"use client";

import { useState, type JSX } from "react";
import styles from "./AiWars.module.css";
import { QtyStepper } from "./QtyStepper";
import type { AppAction } from "./gameReducer";
import type { GameState } from "@/game/types";
import { CONFIG } from "@/game/data/config";
import { getChip } from "@/game/data/chips";
import { getCity } from "@/game/data/cities";
import { maxBuy, maxSell } from "@/game/market";
import { isLastDay } from "@/game/game";
import { tokenResetCost } from "@/game/risks";
import { formatMoney } from "@/game/format";

export interface GameScreenProps {
  game: GameState;
  dispatch(action: AppAction): void;
}

export function GameScreen(props: GameScreenProps): JSX.Element {
  const { game, dispatch } = props;
  const [qty, setQty] = useState<Record<string, number>>({});

  const handleBuy = (chipId: string) => {
    const key = `buy:${chipId}`;
    const quantity = Math.min(qty[key] ?? 0, maxBuy(game, chipId));
    if (quantity > 0) {
      dispatch({ type: "buy", chipId, qty: quantity });
      setQty((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  const handleSell = (chipId: string) => {
    const key = `sell:${chipId}`;
    const quantity = Math.min(qty[key] ?? 0, maxSell(game, chipId));
    if (quantity > 0) {
      dispatch({ type: "sell", chipId, qty: quantity });
      setQty((prev) => ({ ...prev, [key]: 0 }));
    }
  };

  const city = getCity(game.currentCityId);

  return (
    <main className={styles.screen}>
      <p className={styles.header}>
        {`Day ${game.day}/${CONFIG.days} · ${city.shortName} · Cash ${formatMoney(game.cash)} · Debt ${formatMoney(game.debt)} · Uptime ${game.uptime}%`}
      </p>
      {isLastDay(game) && (
        <p className={styles.banner} role="status">
          Last day before the IPO — unsold chips are worth nothing.
        </p>
      )}
      <div className={styles.panes}>
        <section className={styles.pane} aria-label="Market">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Chip</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Qty</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {game.chipIds.map((id) => {
                const chip = getChip(id);
                const entry = game.market[id];
                const max = maxBuy(game, id);
                const key = `buy:${id}`;
                const value = Math.min(qty[key] ?? 0, max);

                return (
                  <tr key={id}>
                    <td>{chip.name}</td>
                    <td className={styles.num} data-label="Price">{formatMoney(entry.price)}</td>
                    <td className={styles.num} data-label="Stock">{entry.stock}</td>
                    <td>
                      <QtyStepper
                        label={`Buy quantity ${chip.name}`}
                        value={value}
                        max={max}
                        onChange={(v) => setQty((prev) => ({ ...prev, [key]: v }))}
                      />
                    </td>
                    <td>
                      {entry.buyBlocked ? (
                        <span>sanctioned</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Buy ${chip.name}`}
                          onClick={() => handleBuy(id)}
                          disabled={value < 1}
                        >
                          Buy
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className={styles.pane} aria-label="Your racks">
          {game.chipIds.some((id) => (game.inventory[id] ?? 0) > 0) ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Chip</th>
                  <th>Held</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {game.chipIds
                  .filter((id) => (game.inventory[id] ?? 0) > 0)
                  .map((id) => {
                    const chip = getChip(id);
                    const held = game.inventory[id] ?? 0;
                    const entry = game.market[id];
                    const max = maxSell(game, id);
                    const key = `sell:${id}`;
                    const value = Math.min(qty[key] ?? 0, max);

                    return (
                      <tr key={id}>
                        <td>{chip.name}</td>
                        <td className={styles.num} data-label="Held">{held}</td>
                        <td className={styles.num} data-label="Price">{formatMoney(entry.price)}</td>
                        <td>
                          <QtyStepper
                            label={`Sell quantity ${chip.name}`}
                            value={value}
                            max={max}
                            onChange={(v) => setQty((prev) => ({ ...prev, [key]: v }))}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            aria-label={`Sell ${chip.name}`}
                            onClick={() => handleSell(id)}
                            disabled={value < 1}
                          >
                            Sell
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          ) : (
            <p>Your racks are empty.</p>
          )}
        </section>
      </div>
      {game.pendingEvent ? (
        <div className={styles.dialog} role="dialog" aria-label="Event">
          <p>{game.pendingEvent.message}</p>
          <button type="button" autoFocus onClick={() => dispatch({ type: "dismiss" })}>
            OK
          </button>
        </div>
      ) : game.pendingRisk ? (
        <RiskDialog game={game} dispatch={dispatch} />
      ) : (
        <nav className={styles.bar} aria-label="Travel">
          {game.cityIds.map((id) => {
            const c = getCity(id);
            const disabled = id === game.currentCityId;
            return (
              <button
                type="button"
                key={id}
                onClick={() => dispatch({ type: "travel", cityId: id })}
                disabled={disabled}
              >
                {c.shortName}
              </button>
            );
          })}
        </nav>
      )}
    </main>
  );
}

function RiskDialog({ game, dispatch }: GameScreenProps): JSX.Element | null {
  const risk = game.pendingRisk;
  if (!risk) return null;
  if (risk.outcome !== "pending") {
    const result =
      risk.outcome === "avoided"
        ? "The token resets worked. Customers stayed online."
        : `Downtime hit. Uptime is now ${game.uptime}%.`;
    return (
      <div className={styles.dialog} role="dialog" aria-label="Uptime risk">
        <p>{result}</p>
        <button type="button" autoFocus onClick={() => dispatch({ type: "dismissRisk" })}>
          OK
        </button>
      </div>
    );
  }
  const triesLeft = CONFIG.tokenResetTries - risk.attempts;
  const chance = Math.round(CONFIG.tokenResetChance * 100);
  return (
    <div className={styles.dialog} role="dialog" aria-label="Uptime risk">
      <p>{risk.attempts > 0 ? `The token resets didn't work. ${risk.message}` : risk.message}</p>
      <button type="button" autoFocus onClick={() => dispatch({ type: "tokenReset" })}>
        {`Give token resets (${formatMoney(tokenResetCost(game))}, ${chance}% · ${triesLeft} left)`}
      </button>
      <button type="button" onClick={() => dispatch({ type: "acceptDowntime" })}>
        Take the downtime
      </button>
    </div>
  );
}
