import { describe, it, expect } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it.each([
    [0, "$0"],
    [7, "$7"],
    [999, "$999"],
    [1000, "$1,000"],
    [5500, "$5,500"],
    [1234567, "$1,234,567"],
    [-54, "-$54"],
    [-5500, "-$5,500"],
  ])("formats %d as %s", (amount, expected) => {
    expect(formatMoney(amount)).toBe(expected);
  });
});
