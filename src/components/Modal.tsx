import type { JSX, ReactNode } from "react";
import styles from "./AiWars.module.css";

export interface ModalProps {
  label: string;
  title: string;
  onClose?: () => void;
  children: ReactNode;
}

export function Modal(props: ModalProps): JSX.Element {
  const { label, title, onClose, children } = props;

  return (
    <div className={styles.overlay}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className={styles.modalHead}>
          <h2>{title}</h2>
          {onClose && (
            <button type="button" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
