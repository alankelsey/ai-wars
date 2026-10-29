import type { ChangeEvent, JSX } from "react";
import styles from "./AiWars.module.css";

export interface QtyStepperProps {
  label: string;
  value: number;
  max: number;
  onChange(value: number): void;
}

export function QtyStepper(props: QtyStepperProps): JSX.Element {
  const { label, value, max, onChange } = props;

  const handleIncrease = () => {
    onChange(Math.min(value + 1, max));
  };

  const handleDecrease = () => {
    onChange(Math.max(value - 1, 0));
  };

  const handleMax = () => {
    onChange(max);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let newValue = parseInt(e.target.value, 10);
    if (isNaN(newValue)) {
      newValue = 0;
    }
    newValue = Math.max(0, Math.min(newValue, max));
    onChange(newValue);
  };

  return (
    <span className={styles.stepper}>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={handleIncrease}
        disabled={value >= max}
      >
        ▲
      </button>
      <input
        type="number"
        aria-label={label}
        min={0}
        max={max}
        value={value}
        onChange={handleChange}
      />
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={handleDecrease}
        disabled={value <= 0}
      >
        ▼
      </button>
      <button
        type="button"
        aria-label={`Max ${label}`}
        onClick={handleMax}
        disabled={max === 0}
      >
        max
      </button>
    </span>
  );
}
