import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QtyStepper } from "./QtyStepper";

describe("QtyStepper", () => {
  it('calls onChange(value+1) when ▲ is clicked', async () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Buy quantity Shreds" value={2} max={5} onChange={onChange} />);

    const increaseBtn = screen.getByRole("button", { name: "Increase Buy quantity Shreds" });
    await userEvent.click(increaseBtn);

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('is disabled at value === max', () => {
    render(<QtyStepper label="Buy quantity Shreds" value={5} max={5} onChange={vi.fn()} />);

    const increaseBtn = screen.getByRole("button", { name: "Increase Buy quantity Shreds" });
    expect(increaseBtn).toBeDisabled();
  });

  it('calls onChange(value-1) when ▼ is clicked', async () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Buy quantity Shreds" value={3} max={5} onChange={onChange} />);

    const decreaseBtn = screen.getByRole("button", { name: "Decrease Buy quantity Shreds" });
    await userEvent.click(decreaseBtn);

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('▼ is disabled at 0', () => {
    render(<QtyStepper label="Buy quantity Shreds" value={0} max={5} onChange={vi.fn()} />);

    const decreaseBtn = screen.getByRole("button", { name: "Decrease Buy quantity Shreds" });
    expect(decreaseBtn).toBeDisabled();
  });

  it('max button calls onChange(max)', async () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Buy quantity Shreds" value={2} max={5} onChange={onChange} />);

    const maxBtn = screen.getByRole("button", { name: "Max Buy quantity Shreds" });
    await userEvent.click(maxBtn);

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('max button is disabled when max is 0', () => {
    render(<QtyStepper label="Buy quantity Shreds" value={0} max={0} onChange={vi.fn()} />);

    const maxBtn = screen.getByRole("button", { name: "Max Buy quantity Shreds" });
    expect(maxBtn).toBeDisabled();
  });

  it('typing "999" with max 5 calls onChange(5)', () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Buy quantity Shreds" value={0} max={5} onChange={onChange} />);

    const input = screen.getByRole("spinbutton", { name: "Buy quantity Shreds" });
    fireEvent.change(input, { target: { value: "999" } });

    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('typing "abc" calls onChange(0)', () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Buy quantity Shreds" value={0} max={5} onChange={onChange} />);

    const input = screen.getByRole("spinbutton", { name: "Buy quantity Shreds" });
    fireEvent.change(input, { target: { value: "abc" } });

    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('typing "-3" calls onChange(0)', () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Buy quantity Shreds" value={0} max={5} onChange={onChange} />);

    const input = screen.getByRole("spinbutton", { name: "Buy quantity Shreds" });
    fireEvent.change(input, { target: { value: "-3" } });

    expect(onChange).toHaveBeenCalledWith(0);
  });
});
