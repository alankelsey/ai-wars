import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home page", () => {
  it("is the landing page with a link to the classic game", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "AI WARS!" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play AI WARS! Classic" })).toBeInTheDocument();
  });
});
