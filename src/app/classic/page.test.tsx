import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ClassicPage, { metadata } from "./page";

describe("Classic page", () => {
  it("renders the game", () => {
    render(<ClassicPage />);
    expect(screen.getByRole("heading", { name: "AI WARS!" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start New Game" })).toBeInTheDocument();
  });

  it("has its own title", () => {
    expect(metadata.title).toBe("AI WARS! Classic");
  });
});
