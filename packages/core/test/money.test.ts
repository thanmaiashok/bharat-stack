import { describe, expect, it } from "vitest";
import { BharatInputError, paiseToDecimalString, paiseToRupees, toPaise } from "../src/index.js";

describe("toPaise", () => {
  it.each([
    [0, 0],
    [1, 100],
    [12345678.5, 1234567850],
    [1.005, 101], // float trap: 1.005 * 100 = 100.4999…
    [1.004, 100],
    [0.1 + 0.2, 30],
    [-1.005, -101],
    [-0.004, 0],
    [1e-7, 0],
    ["12,345.50", 1234550],
    ["₹ 1,00,000", 10000000],
    ["Rs. 99.999", 10000],
    ["Rs 5", 500],
    ["7.", 700],
  ])("%s → %s paise", (input, expected) => {
    expect(toPaise(input)).toBe(expected);
  });

  it.each([NaN, Infinity, "abc", "", "1.2.3", 1e20])("rejects %s", (bad) => {
    expect(() => toPaise(bad)).toThrow(BharatInputError);
  });
});

describe("paise conversions", () => {
  it("formats paise as a decimal string", () => {
    expect(paiseToDecimalString(123450)).toBe("1234.50");
    expect(paiseToDecimalString(-5)).toBe("-0.05");
    expect(paiseToDecimalString(0)).toBe("0.00");
    expect(paiseToRupees(1234550)).toBe(12345.5);
  });
  it("rejects fractional paise", () => {
    expect(() => paiseToDecimalString(1.5)).toThrow(BharatInputError);
  });
});

import { escapeXml } from "../src/index.js";
import { el, renderXml } from "../src/xml.js";

describe("xml helpers", () => {
  it("escapes markup and strips control characters", () => {
    expect(escapeXml(`a&b<c>"d"'e'\u0001`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
  });
  it("renders empty, text and nested elements", () => {
    expect(renderXml(el("A"))).toBe("<A/>");
    expect(renderXml(el("A", { x: "1" }, el("B", "t"), null, false))).toBe(
      '<A x="1">\n  <B>t</B>\n</A>',
    );
    expect(renderXml(el("A", el("B"), "text"))).toBe("<A>\n  <B/>\n  text\n</A>");
  });
});
