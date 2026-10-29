// Stats panel: city, day progress, cash/data center/debt/net worth meters and uptime/racks.
import type { JSX } from "react";
import styles from "./AiWars.module.css";
import type { GameState } from "@/game/types";
import { CONFIG } from "@/game/data/config";
import { getCity } from "@/game/data/cities";
import { netWorth } from "@/game/game";
import { formatMoney } from "@/game/format";
import { getDifficulty } from "@/game/data/difficulty";

export interface StatsPanelProps {
  game: GameState;
  onOpenDataCenter(): void;
}

export function StatsPanel(props: StatsPanelProps): JSX.Element {
  const { game, onOpenDataCenter } = props;
  const city = getCity(game.currentCityId);
  const cash = game.cash;
  const dataCenter = game.dataCenter;
  const debt = game.debt;
  const netWorthValue = netWorth(game);
  const uptime = Math.round(game.uptime);

  const totalPallets = Object.values(game.inventory).reduce((sum, qty) => sum + qty, 0);

  return (
    <section className={styles.stats} aria-label="Stats">
      <div className={styles.statsHead}>
        <div>
          <h2>{city.shortName}</h2>
          <span className={styles.level}>{getDifficulty(game.difficulty).label}</span>
        </div>
        <span>{`Day ${game.day}/${CONFIG.days}`}</span>
      </div>
      <div
        className={styles.meter}
        role="progressbar"
        aria-label="Days"
        aria-valuemin={1}
        aria-valuemax={CONFIG.days}
        aria-valuenow={game.day}
      >
        <span style={{ width: `${(game.day / CONFIG.days) * 100}%` }} />
      </div>
      <dl className={styles.statGrid}>
        <div>
          <dt>Cash</dt>
          <dd>{formatMoney(cash)}</dd>
        </div>
        <div>
          <dt>Data center</dt>
          <dd>
            <button
              type="button"
              className={styles.linkButton}
              onClick={onOpenDataCenter}
              aria-label="Open data center"
            >
              {formatMoney(dataCenter)} ↗
            </button>
          </dd>
        </div>
        <div>
          <dt>Debt</dt>
          <dd className={styles.bad}>{formatMoney(debt)}</dd>
        </div>
        <div>
          <dt>Net worth</dt>
          <dd className={netWorthValue < 0 ? styles.bad : styles.good}>
            {formatMoney(netWorthValue)}
          </dd>
        </div>
      </dl>
      <div className={styles.uptime}>
        <span>Uptime</span>
        <div
          className={styles.meter}
          role="progressbar"
          aria-label="Uptime"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uptime}
        >
          <span style={{ width: `${uptime}%` }} />
        </div>
        <span>{`${uptime}%`}</span>
        <span>{`Racks ${totalPallets}`}</span>
      </div>
    </section>
  );
}
