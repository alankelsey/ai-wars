import Link from "next/link";
import styles from "./Landing.module.css";
import { MOCKS } from "@/site/mocks";
import type { JSX } from "react";

export function Landing(): JSX.Element {
  return (
    <main className={styles.landing}>
      <h1 className={styles.heading}>AI WARS!</h1>
      <p className={styles.intro}>Prototype games about the AI chip gold rush. Pick a mock to play — each one tests a different idea.</p>
      <ul className={styles.mocks} aria-label="Mocks">
        {MOCKS.map((mock) => (
          <li key={mock.id} className={styles.card}>
            <div className={styles.cardHead}>
              <h2>{mock.title}</h2>
              <span className={styles.status}>{mock.status}</span>
            </div>
            <p>{mock.pitch}</p>
            <Link className={styles.play} href={mock.href}>{`Play ${mock.title}`}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
