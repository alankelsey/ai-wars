// Quantity picker: number input with slider and +/- controls for trade modals.
import type { ChangeEvent, JSX } from "react";
import styles from "./AiWars.module.css";

export interface QtyPickerProps {
  label: string;
  value: number;
  max: number;
  onChange(value: number): void;
}

export function QtyPicker(props: QtyPickerProps): JSX.Element {
  const { label, value, max, onChange } = props;

  const handleNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    let newValue = parseInt(e.target.value, 10);
    if (isNaN(newValue)) {
      newValue = 0;
    }
    newValue = Math.max(0, Math.min(max, newValue));
    onChange(newValue);
  };

  const handleSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    onChange(newValue);
  };

  const handleMaxClick = () => {
    if (max > 0) {
      onChange(max);
    }
  };

  const handleIncrease = () => {
    if (value < max) {
      onChange(value + 1);
    }
  };

  const handleDecrease = () => {
    if (value > 0) {
      onChange(value - 1);
    }
  };

  return (
    <div className={styles.picker}>
      <div className={styles.pickerRow}>
        <input
          type="number"
          aria-label={label}
          min={0}
          max={max}
          value={value}
          onChange={handleNumberChange}
        />
        <button
          type="button"
          aria-label={`Max ${label}`}
          onClick={handleMaxClick}
          disabled={max === 0}
        >
          Max
        </button>
      </div>
      <div className={styles.pickerRow}>
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={handleDecrease}
          disabled={value === 0}
        >
          −
        </button>
        <input
          type="range"
          aria-label={`${label} slider`}
          min={0}
          max={max}
          step={1}
          value={value}
          onChange={handleSliderChange}
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={handleIncrease}
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}
