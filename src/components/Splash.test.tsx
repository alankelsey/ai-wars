import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Splash } from "./Splash";
import { COMPANIES } from "@/game/data/companies";
import { CONFIG } from "@/game/data/config";
import { formatMoney } from "@/game/format";

describe("Splash difficulty", () => {
  it("offers Normal, Hard, Brutal with Hard selected", () => {
    render(<Splash onStart={() => {}} />);
    const select = screen.getByLabelText<HTMLSelectElement>("Difficulty");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Normal", "Hard", "Brutal"]);
    expect(select.value).toBe("hard");
  });

  it("starts with the chosen difficulty", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<Splash onStart={onStart} />);
    await user.selectOptions(screen.getByLabelText("Difficulty"), "brutal");
    await user.click(screen.getByRole("button", { name: "Start New Game" }));
    expect(onStart).toHaveBeenCalledWith(COMPANIES[0], false, "brutal");
  });
});

describe("Splash story", () => {
  it("tells the loan-shark story in two paragraphs, money with a leading $", async () => {
    const user = userEvent.setup();
    render(<Splash onStart={() => {}} />);
    expect(screen.getByText(
      `You are an AI tech bro/bae at ${COMPANIES[0]} trying to outfit your datacenters. You received ${formatMoney(CONFIG.startDebt)} from a loan shark.`,
    ).tagName).toBe("P");
    expect(screen.getByText(
      `Repay your loan and turn a profit before your IPO. You only have ${CONFIG.days} days.`,
    ).tagName).toBe("P");
    expect(formatMoney(CONFIG.startDebt)).toMatch(/^\$\d/);

    await user.selectOptions(screen.getByLabelText("Company"), COMPANIES[1]);
    expect(screen.getByText(new RegExp(`AI tech bro/bae at ${COMPANIES[1]} trying`))).toBeTruthy();
  });
});
