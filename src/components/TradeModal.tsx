// Trade modal: buy/sell details, quantity picker, and confirm button for a single chip.
import { useState, type JSX } from "react";
import { Modal } from "./Modal";
import { QtyPicker } from "./QtyPicker";
import styles from "./AiWars.module.css";
import type { GameState } from "@/game/types";
import { getChip } from "@/game/data/chips";
import { maxBuy, maxSell } from "@/game/market";
import { formatMoney } from "@/game/format";

export interface TradeModalProps {
  game: GameState;
  chipId: string;
  mode: "buy" | "sell";
  onConfirm(qty: number): void;
  onClose(): void;
}

export function TradeModal(props: TradeModalProps): JSX.Element {
  const { game, chipId, mode, onConfirm, onClose } = props;

  const chip = getChip(chipId);
  const name = chip.name;
  const price = game.market[chipId].price;
  const held = game.inventory[chipId] ?? 0;
  const avg = Math.round(game.avgCost[chipId] ?? 0);
  const max = mode === "buy" ? maxBuy(game, chipId) : maxSell(game, chipId);

  const [qty, setQty] = useState<number>(Math.min(1, max));

  const buyBlocked = game.market[chipId].buyBlocked;

  return (
    <Modal label={`${mode === "buy" ? "Buy" : "Sell"} ${name}`} title={`${mode === "buy" ? "Buy" : "Sell"} ${name}`} onClose={onClose}>
      <dl className={styles.facts}>
        <div>
          <dt>Price per pallet</dt>
          <dd>{formatMoney(price)}</dd>
        </div>
        <div>
          <dt>Your cash</dt>
          <dd>{formatMoney(game.cash)}</dd>
        </div>
        <div>
          <dt>Held</dt>
          <dd>
            {held > 0 ? `${held} · avg ${formatMoney(avg)}` : "0"}
          </dd>
        </div>
        <div>
          <dt>Max quantity</dt>
          <dd>{max}</dd>
        </div>
      </dl>

      {mode === "buy" && buyBlocked && (
        <p>Sanctioned here: you can&apos;t buy {name} in this city.</p>
      )}

      <QtyPicker label="Quantity" value={qty} max={max} onChange={setQty} />

      <dl className={styles.facts}>
        <div>
          <dt>{mode === "buy" ? "Total cost" : "Total"}</dt>
          <dd>{formatMoney(price * qty)}</dd>
        </div>
        {mode === "sell" && held > 0 && (
          <div>
            <dt>Profit vs avg</dt>
            <dd className={price >= avg ? styles.good : styles.bad}>{formatMoney((price - avg) * qty)}</dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        className={styles.primary}
        disabled={qty < 1}
        onClick={() => onConfirm(qty)}
      >
        {mode === "buy" ? `Buy ${qty} ${name}` : `Sell ${qty} ${name}`}
      </button>
    </Modal>
  );
}
