import { describe, expect, it } from "vitest";
import {
  amountInWords,
  BharatInputError,
  formatINR,
  formatPaise,
  groupIndian,
  numberToIndianWords,
  paiseInWords,
} from "../src/index.js";

describe("formatINR", () => {
  it.each([
    [12345678.5, "₹1,23,45,678.50"],
    [0, "₹0.00"],
    [5, "₹5.00"],
    [999, "₹999.00"],
    [1000, "₹1,000.00"],
    [99999.99, "₹99,999.99"],
    [100000, "₹1,00,000.00"],
    [10000000, "₹1,00,00,000.00"],
    [-1234.5, "-₹1,234.50"],
    [-0.001, "₹0.00"],
    ["1,23,456.789", "₹1,23,456.79"],
  ])("%s → %s", (input, expected) => {
    expect(formatINR(input)).toBe(expected);
  });

  it("supports no symbol and whole rupees", () => {
    expect(formatINR(1234567.5, { symbol: false })).toBe("12,34,567.50");
    expect(formatINR(2.5, { decimals: 0 })).toBe("₹3");
    expect(formatINR(2.49, { decimals: 0 })).toBe("₹2");
    expect(formatINR(-1500000.5, { decimals: 0 })).toBe("-₹15,00,001");
    expect(formatPaise(-1, { decimals: 0 })).toBe("₹0");
  });

  it("groups digit strings", () => {
    expect(groupIndian("1")).toBe("1");
    expect(groupIndian("1234")).toBe("1,234");
    expect(groupIndian("123456789012")).toBe("1,23,45,67,89,012");
  });
});

describe("amountInWords", () => {
  it("matches the spec example", () => {
    expect(amountInWords(12345678.5)).toBe(
      "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only",
    );
  });

  it.each([
    [0, "Rupees Zero Only"],
    [0.5, "Fifty Paise Only"],
    [0.07, "Seven Paise Only"],
    [1, "Rupees One Only"],
    [11, "Rupees Eleven Only"],
    [40, "Rupees Forty Only"],
    [100, "Rupees One Hundred Only"],
    [101, "Rupees One Hundred One Only"],
    [1000, "Rupees One Thousand Only"],
    [100000, "Rupees One Lakh Only"],
    [150000.25, "Rupees One Lakh Fifty Thousand and Twenty-Five Paise Only"],
    [10000000, "Rupees One Crore Only"],
    [1230000000, "Rupees One Hundred Twenty-Three Crore Only"],
    [1000000000000, "Rupees One Lakh Crore Only"],
    [-25, "Minus Rupees Twenty-Five Only"],
  ])("%s → %s", (input, expected) => {
    expect(amountInWords(input)).toBe(expected);
  });

  it("works from paise and rejects bad input", () => {
    expect(paiseInWords(9999)).toBe("Rupees Ninety-Nine and Ninety-Nine Paise Only");
    expect(() => paiseInWords(0.5)).toThrow(BharatInputError);
    expect(() => numberToIndianWords(-1)).toThrow(BharatInputError);
    expect(numberToIndianWords(0)).toBe("Zero");
  });
});
