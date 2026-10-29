// Modal for depositing/withdrawing cash and chips from the data center.
import { useState, type JSX } from "react";
import { Modal } from "./Modal";
import { QtyPicker } from "./QtyPicker";
import styles from "./AiWars.module.css";
import type { GameState } from "@/game/types";
import { canUseDataCenter } from "@/game/datacenter";
import { formatMoney } from "@/game/format";
import { getChip } from "@/game/data/chips";

export interface DataCenterModalProps {
  game: GameState;
  onDeposit(amount: number): void;
  onWithdraw(amount: number): void;
  onDepositChips(chipId: string, qty: number): void;
  onWithdrawChips(chipId: string, qty: number): void;
  onClose(): void;
}

export function DataCenterModal(props: DataCenterModalProps): JSX.Element {
  const { game, onDeposit, onWithdraw, onDepositChips, onWithdrawChips, onClose } = props;

  const open = canUseDataCenter(game);

  const ownedChips = game.chipIds.filter((id) => (game.inventory[id] ?? 0) + (game.dataCenterChips[id] ?? 0) > 0);
  const [chipId, setChipId] = useState<string>(ownedChips[0] ?? game.chipIds[0]);

  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(0);
  const [storeQty, setStoreQty] = useState<number>(0);
  const [retrieveQty, setRetrieveQty] = useState<number>(0);

  const storeMax = open ? (game.inventory[chipId] ?? 0) : 0;
  const retrieveMax = open ? (game.dataCenterChips[chipId] ?? 0) : 0;

  return (
    <Modal label="Data center" title="Data center" onClose={onClose}>
      <p>Park cash and chips where risks can&apos;t reach them. Stored chips can&apos;t be sold until you take them out. One data center transaction per day.</p>

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

      {ownedChips.length > 0 && (
        <section className={styles.panel} aria-label="Chips">
          <h3>Chips</h3>
          <label>
            Chip{" "}
            <select
              value={chipId}
              onChange={(e) => {
                setChipId(e.target.value);
                setStoreQty(0);
                setRetrieveQty(0);
              }}
            >
              {ownedChips.map((id) => {
                const chip = getChip(id);
                const onHand = game.inventory[id] ?? 0;
                const stored = game.dataCenterChips[id] ?? 0;
                return (
                  <option key={id} value={id}>
                    {`${chip.name} — ${onHand} on hand, ${stored} stored`}
                  </option>
                );
              })}
            </select>
          </label>

          <QtyPicker label="Store pallets" value={storeQty} max={storeMax} onChange={setStoreQty} />
          <button
            type="button"
            disabled={storeQty < 1}
            onClick={() => onDepositChips(chipId, storeQty)}
          >
            Store
          </button>

          <QtyPicker label="Retrieve pallets" value={retrieveQty} max={retrieveMax} onChange={setRetrieveQty} />
          <button
            type="button"
            disabled={retrieveQty < 1}
            onClick={() => onWithdrawChips(chipId, retrieveQty)}
          >
            Retrieve
          </button>
        </section>
      )}
    </Modal>
  );
}
