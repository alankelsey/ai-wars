// Splash screen: company, interest and difficulty pickers, then Start New Game.
"use client";

import { useState, type FormEvent, type JSX } from "react";
import styles from "./AiWars.module.css";
import { COMPANIES } from "@/game/data/companies";
import { CONFIG } from "@/game/data/config";
import { formatMoney } from "@/game/format";
import type { Difficulty } from "@/game/types";
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from "@/game/data/difficulty";

const TITLE = ` █████  ██    ██     ██  █████  ██████   ██████ ██
██   ██ ██    ██     ██ ██   ██ ██   ██ ██      ██
███████ ██    ██  █  ██ ███████ ██████   █████  ██
██   ██ ██    ██ ███ ██ ██   ██ ██   ██      ██
██   ██ ██     ███ ███  ██   ██ ██   ██ ██████  ██`;

export interface SplashProps {
  onStart(company: string, interestEnabled: boolean, difficulty: Difficulty): void;
}

export function Splash(props: SplashProps): JSX.Element {
  const [company, setCompany] = useState<string>(COMPANIES[0]);
  const [interestEnabled, setInterestEnabled] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    props.onStart(company, interestEnabled, difficulty);
  };

  return (
    <main className={styles.screen}>
      <h1 className={styles.srOnly}>AI WARS!</h1>
      <pre className={styles.title} aria-hidden="true">
{TITLE}
      </pre>
      <p className={styles.story}>
        {`You are an AI tech bro/bae at ${company} trying to outfit your datacenters. You have ${formatMoney(CONFIG.startCash)} and ${CONFIG.days} days to turn a profit before your IPO.`}
      </p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label>
          Company
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            {COMPANIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={interestEnabled}
            onChange={(e) => setInterestEnabled(e.target.checked)}
          />
          Loan interest
        </label>
        <label>
          Difficulty
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
            {DIFFICULTIES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Start New Game</button>
      </form>
      <nav className={styles.links} aria-label="Links">
        <a href="#">GitHub</a>
        <a href="#">X</a>
        <a href="#">Bluesky</a>
      </nav>
    </main>
  );
}
