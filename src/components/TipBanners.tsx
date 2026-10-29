// Tip banners: dismissable market tips for the current day.
import { useState, type JSX } from "react";
import styles from "./AiWars.module.css";
import type { MarketTip } from "@/game/types";

export interface TipBannersProps {
  tips: readonly MarketTip[];
  day: number;
}

export function TipBanners(props: TipBannersProps): JSX.Element {
  const { tips, day } = props;

  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const visibleTips = tips.filter(
    (tip) => !dismissed.has(`${day}:${tip.message}`)
  );

  if (visibleTips.length === 0) {
    return <></>;
  }

  return (
    <>
      {visibleTips.map((tip) => {
        const key = `${day}:${tip.message}`;
        return (
          <p key={key} className={styles.tip} role="note">
            {tip.message}
            <button
              type="button"
              aria-label="Dismiss tip"
              onClick={() => setDismissed((prev) => new Set(prev).add(key))}
            >
              ×
            </button>
          </p>
        );
      })}
    </>
  );
}
