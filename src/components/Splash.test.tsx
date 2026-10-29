import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Splash } from "./Splash";
import { COMPANIES } from "@/game/data/companies";

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
