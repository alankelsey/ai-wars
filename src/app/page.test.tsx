import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "./page";

describe("Home page", () => {
  it("renders AI WARS! heading", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "AI WARS!" })).toBeInTheDocument();
  });
});
