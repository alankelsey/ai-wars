import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QtyPicker } from "./QtyPicker";

function renderPicker(value: number, max: number): ReturnType<typeof vi.fn<(v: number) => void>> {
  const onChange = vi.fn<(v: number) => void>();
  render(<QtyPicker label="Quantity" value={value} max={max} onChange={onChange} />);
  return onChange;
}

const button = (name: string): HTMLElement => screen.getByRole("button", { name });

describe("QtyPicker", () => {
  it("increases by one", () => {
    const onChange = renderPicker(5, 10);
    fireEvent.click(button("Increase Quantity"));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("disables increase at max", () => {
    renderPicker(10, 10);
    expect(button("Increase Quantity")).toBeDisabled();
  });

  it("decreases by one", () => {
    const onChange = renderPicker(5, 10);
    fireEvent.click(button("Decrease Quantity"));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("disables decrease at 0", () => {
    renderPicker(0, 10);
    expect(button("Decrease Quantity")).toBeDisabled();
  });

  it("jumps to max", () => {
    const onChange = renderPicker(3, 10);
    fireEvent.click(button("Max Quantity"));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("disables max and increase when max is 0", () => {
    renderPicker(0, 0);
    expect(button("Max Quantity")).toBeDisabled();
    expect(button("Increase Quantity")).toBeDisabled();
  });

  it.each([
    ["999", 5],
    ["abc", 0],
    ["-3", 0],
    ["2", 2],
  ])("clamps typed value %s to %d", (typed, expected) => {
    const onChange = renderPicker(1, 5);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantity" }), { target: { value: typed } });
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it("follows the slider", () => {
    const onChange = renderPicker(0, 5);
    fireEvent.change(screen.getByRole("slider", { name: "Quantity slider" }), { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
