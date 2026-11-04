import { describe, expect, it } from "vitest";
import {
  BharatInputError,
  buildUpiUri,
  gstRateSlabs,
  gstRule,
  isValidGSTRate,
  validateVPA,
} from "../src/index.js";

describe("UPI", () => {
  it("builds an encoded upi://pay link", () => {
    const r = buildUpiUri({
      vpa: " shop.name-1@okicici ",
      payeeName: "Shree Ganesh & Sons",
      amount: "1,499.5",
      note: "Order #12",
      txnRef: "INV/1",
    });
    expect(r.uri).toBe(
      "upi://pay?pa=shop.name-1@okicici&pn=Shree%20Ganesh%20%26%20Sons&am=1499.50&cu=INR&tn=Order%20%2312&tr=INV%2F1",
    );
    expect(r.amount).toBe("1499.50");
    expect(r.note).toMatch(/does not confirm payment/);
  });

  it("omits the amount when not given and encodes reserved characters", () => {
    expect(buildUpiUri({ vpa: "ab@upi", payeeName: "A (B)'s" }).uri).toBe(
      "upi://pay?pa=ab@upi&pn=A%20%28B%29%27s&cu=INR",
    );
  });

  it("warns on long notes and rejects bad input", () => {
    expect(
      buildUpiUri({ vpa: "ab@upi", payeeName: "A", note: "x".repeat(81) }).warnings[0]?.code,
    ).toBe("UPI_NOTE_LONG");
    expect(() => buildUpiUri({ vpa: "ab@upi", payeeName: " " })).toThrow(BharatInputError);
    expect(() => buildUpiUri({ vpa: "ab@upi", payeeName: "A", amount: 0 })).toThrow(
      BharatInputError,
    );
    expect(() => buildUpiUri({ vpa: "nope", payeeName: "A" })).toThrow(BharatInputError);
  });

  it.each(["a@upi", "name@", "@bank", "na me@upi", "name@1bank", "name@@upi"])(
    "rejects VPA %s",
    (v) => {
      expect(validateVPA(v).valid).toBe(false);
    },
  );
});

describe("GST rate data", () => {
  it("knows which slabs are valid on a date", () => {
    expect(gstRateSlabs("2026-11-04").map((s) => s.rate)).toEqual([0, 0.25, 1.5, 3, 5, 18, 40]);
    expect(gstRateSlabs("2025-06-01").map((s) => s.rate)).toEqual([0, 0.25, 1.5, 3, 5, 12, 18, 28]);
    expect(gstRateSlabs("2025-12-01").map((s) => s.rate)).toContain(28);
    expect(gstRateSlabs().length).toBe(9);
    expect(isValidGSTRate(18, "04-11-2026")).toBe(true);
    expect(isValidGSTRate(12, "04-11-2026")).toBe(false);
  });

  it("exposes rule values and rejects unknown ones", () => {
    expect(gstRule<number>("invoice_number_max_length")).toBe(16);
    expect(() => gstRule("nope")).toThrow(BharatInputError);
  });
});
