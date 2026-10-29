"use client";

import { useState, type JSX } from "react";
import styles from "./AiWars.module.css";
import type { AppAction } from "./gameReducer";
import { Modal } from "./Modal";
import { StatsPanel } from "./StatsPanel";
import { TipBanners } from "./TipBanners";
import { MarketList } from "./MarketList";
import { TradeModal } from "./TradeModal";
import { DataCenterModal } from "./DataCenterModal";
import type { GameState } from "@/game/types";
import { CONFIG } from "@/game/data/config";
import { getCity } from "@/game/data/cities";
import { getRisk } from "@/game/data/risks";
import { isLastDay } from "@/game/game";
import { tokenResetCost } from "@/game/risks";
import { formatMoney } from "@/game/format";

export interface GameScreenProps {
  game: GameState;
  dispatch(action: AppAction): void;
}

interface Trade {
  chipId: string;
  mode: "buy" | "sell";
}

export function GameScreen({ game, dispatch }: GameScreenProps): JSX.Element {
  const [trade, setTrade] = useState<Trade | null>(null);
  const [bankOpen, setBankOpen] = useState(false);

  return (
    <main className={`${styles.screen} ${styles.gameScreen}`}>
      <StatsPanel game={game} onOpenDataCenter={() => setBankOpen(true)} />
      {isLastDay(game) && (
        <p className={styles.banner} role="status">
          Last day before the IPO — unsold chips are worth nothing.
        </p>
      )}
      <TipBanners tips={game.tips} day={game.day} />
      <MarketList game={game} onTrade={(chipId, mode) => setTrade({ chipId, mode })} />
      <TravelBar game={game} dispatch={dispatch} />

      {trade && (
        <TradeModal
          key={`${trade.chipId}:${trade.mode}`}
          game={game}
          chipId={trade.chipId}
          mode={trade.mode}
          onConfirm={(qty) => {
            dispatch({ type: trade.mode, chipId: trade.chipId, qty });
            setTrade(null);
          }}
          onClose={() => setTrade(null)}
        />
      )}
      {bankOpen && (
        <DataCenterModal
          game={game}
          onDeposit={(amount) => {
            dispatch({ type: "deposit", amount });
            setBankOpen(false);
          }}
          onWithdraw={(amount) => {
            dispatch({ type: "withdraw", amount });
            setBankOpen(false);
          }}
          onClose={() => setBankOpen(false)}
        />
      )}
      {game.pendingEvent && (
        <Modal label="Event" title={game.pendingEvent.good ? "Lucky break" : "Trouble"}>
          <p>{game.pendingEvent.message}</p>
          <button type="button" autoFocus onClick={() => dispatch({ type: "dismiss" })}>
            OK
          </button>
        </Modal>
      )}
      {!game.pendingEvent && game.pendingRisk && <RiskModal game={game} dispatch={dispatch} />}
    </main>
  );
}

function TravelBar({ game, dispatch }: GameScreenProps): JSX.Element {
  return (
    <nav className={styles.bar} aria-label="Travel">
      <p className={styles.barHead}>
        <span>Catch a flight</span>
        <span>Every trip takes one day</span>
      </p>
      {game.cityIds.map((id) => (
        <button
          type="button"
          key={id}
          disabled={id === game.currentCityId}
          onClick={() => dispatch({ type: "travel", cityId: id })}
        >
          {getCity(id).shortName}
        </button>
      ))}
    </nav>
  );
}

function RiskModal({ game, dispatch }: GameScreenProps): JSX.Element | null {
  const risk = game.pendingRisk;
  if (!risk) return null;
  const title = getRisk(risk.kind).title;

  if (risk.outcome !== "pending") {
    const result =
      risk.outcome === "avoided"
        ? "The token resets made customers forget about the outage. Uptime preserved."
        : `Downtime hit. Uptime is now ${game.uptime}%.`;
    return (
      <Modal label="Uptime risk" title={title}>
        <p>{result}</p>
        <button type="button" autoFocus onClick={() => dispatch({ type: "dismissRisk" })}>
          OK
        </button>
      </Modal>
    );
  }

  const triesLeft = CONFIG.tokenResetTries - risk.attempts;
  const chance = Math.round(CONFIG.tokenResetChance * 100);
  return (
    <Modal label="Uptime risk" title={title}>
      <p>{risk.attempts > 0 ? `The token resets didn't work. ${risk.message}` : risk.message}</p>
      <p>{`Uptime ${game.uptime}% · ${triesLeft} token reset ${triesLeft === 1 ? "try" : "tries"} left`}</p>
      <div className={styles.choices}>
        <button type="button" className={styles.primary} autoFocus onClick={() => dispatch({ type: "tokenReset" })}>
          {`Give customers token resets (${formatMoney(tokenResetCost(game))}, ${chance}% chance)`}
        </button>
        <button type="button" onClick={() => dispatch({ type: "acceptDowntime" })}>
          Take the downtime
        </button>
      </div>
    </Modal>
  );
}
