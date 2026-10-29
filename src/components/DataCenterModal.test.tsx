import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataCenterModal } from "./DataCenterModal";
import { makeState, CHIP_IDS, fill } from "@/game/testUtils";
import { getChip } from "@/game/data/chips";
import type { GameState } from "@/game/types";

// chipIds order puts B before A, so B (stored only) is the first owned chip and the default selection.
const A = CHIP_IDS[2];
const B = CHIP_IDS[1];

function owning(): GameState {
  const base = makeState();
  return {
    ...base,
    inventory: { ...fill(CHIP_IDS, 0), [A]: 6 },
    dataCenterChips: { ...fill(CHIP_IDS, 0), [B]: 4 },
  };
}

function renderModal(game: GameState) {
  const props = {
    onDeposit: vi.fn(), onWithdraw: vi.fn(), onDepositChips: vi.fn(), onWithdrawChips: vi.fn(), onClose: vi.fn(),
  };
  render(<DataCenterModal game={game} {...props} />);
  return props;
}

describe("DataCenterModal chips", () => {
  it("explains the rules", () => {
    renderModal(owning());
    expect(screen.getByText(
      "Park cash and chips where risks can't reach them. Stored chips can't be sold until you take them out. One data center transaction per day.",
    )).toBeTruthy();
  });

  it("lists owned chips with on-hand and stored counts", () => {
    renderModal(owning());
    const select = screen.getByLabelText<HTMLSelectElement>("Chip");
    expect([...select.options].map((o) => o.textContent)).toEqual([
      `${getChip(B).name} — 0 on hand, 4 stored`,
      `${getChip(A).name} — 6 on hand, 0 stored`,
    ]);
  });

  it("stores on-hand pallets of the chosen chip", async () => {
    const user = userEvent.setup();
    const props = renderModal(owning());
    await user.selectOptions(screen.getByLabelText("Chip"), A);
    const chips = screen.getByRole("region", { name: "Chips" });
    await user.click(within(chips).getByRole("button", { name: "Max Store pallets" }));
    await user.click(within(chips).getByRole("button", { name: "Store" }));
    expect(props.onDepositChips).toHaveBeenCalledWith(A, 6);
  });

  it("defaults to the first owned chip and retrieves its stored pallets", async () => {
    const user = userEvent.setup();
    const props = renderModal(owning());
    expect(screen.getByLabelText<HTMLSelectElement>("Chip").value).toBe(B);
    const chips = screen.getByRole("region", { name: "Chips" });
    await user.click(within(chips).getByRole("button", { name: "Max Retrieve pallets" }));
    await user.click(within(chips).getByRole("button", { name: "Retrieve" }));
    expect(props.onWithdrawChips).toHaveBeenCalledWith(B, 4);
  });

  it("hides the chips section when nothing is owned", () => {
    renderModal(makeState());
    expect(screen.queryByRole("region", { name: "Chips" })).toBeNull();
  });
});
