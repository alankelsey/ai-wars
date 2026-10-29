import { useState, type JSX } from "react";
import { Modal } from "./Modal";
import { QtyPicker } from "./QtyPicker";
import styles from "./AiWars.module.css";
import type { GameState } from "@/game/types";
import { canUseDataCenter } from "@/game/datacenter";
import { formatMoney } from "@/game/format";

export interface DataCenterModalProps {
  game: GameState;
  onDeposit(amount: number): void;
  onWithdraw(amount: number): void;
  onClose(): void;
}

export function DataCenterModal(props: DataCenterModalProps): JSX.Element {
  const { game, onDeposit, onWithdraw, onClose } = props;

  const open = canUseDataCenter(game);

  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);

  return (
    <Modal label="Data center" title="Data center" onClose={onClose}>
      <p>Park cash where risks can&apos;t reach it. One deposit or withdrawal per day.</p>

      <dl className={styles.facts}>
        <div>
          <dt>Cash</dt>
          <dd>{formatMoney(game.cash)}</dd>
        </div>
        <div>
          <dt>Data center</dt>
          <dd>{formatMoney(game.dataCenter)}</dd>
        </div>
      </dl>

      {!open && (
        <p role="status">Already used today. Travel to use the data center again.</p>
      )}

      <section className={styles.panel} aria-label="Deposit">
        <h3>Deposit</h3>
        <QtyPicker
          label="Deposit amount"
          value={depositAmount}
          max={open ? game.cash : 0}
          onChange={setDepositAmount}
        />
        <button
          type="button"
          disabled={depositAmount < 1}
          onClick={() => onDeposit(depositAmount)}
        >
          Deposit
        </button>
      </section>

      <section className={styles.panel} aria-label="Withdraw">
        <h3>Withdraw</h3>
        <QtyPicker
          label="Withdraw amount"
          value={withdrawAmount}
          max={open ? game.dataCenter : 0}
          onChange={setWithdrawAmount}
        />
        <button
          type="button"
          disabled={withdrawAmount < 1}
          onClick={() => onWithdraw(withdrawAmount)}
        >
          Withdraw
        </button>
      </section>
    </Modal>
  );
}
