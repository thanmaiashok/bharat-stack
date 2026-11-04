import { describe, expect, it } from "vitest";
import {
  createInvoice,
  divRound,
  generateTestGSTIN,
  type InvoiceInput,
  TAX_DISCLAIMER,
} from "../src/index.js";
import { GSTIN, interStateInput, intraStateInput } from "./fixtures.js";

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const ok = (input: InvoiceInput) => {
  const r = createInvoice(input);
  if (!r.invoice) throw new Error(JSON.stringify(r.errors));
  return { ...r, invoice: r.invoice };
};

describe("divRound", () => {
  it("rounds half away from zero", () => {
    expect(divRound(5, 10)).toBe(1);
    expect(divRound(4, 10)).toBe(0);
    expect(divRound(-5, 10)).toBe(-1);
    expect(divRound(15, -10)).toBe(-2);
    expect(divRound(-4, 10)).toBe(0);
    expect(divRound(9_000_000_000_000_000 / 10, 1)).toBe(900_000_000_000_000);
  });
});

describe("createInvoice: inter-state (Bengaluru → Mumbai)", () => {
  const { invoice, warnings } = ok(interStateInput());

  it("charges IGST only", () => {
    expect(invoice.supplyType).toBe("INTER_STATE");
    expect(invoice.placeOfSupply).toEqual({ code: "27", name: "Maharashtra" });
    expect(invoice.totals.cgst).toBe(0);
    expect(invoice.totals.sgst).toBe(0);
    expect(warnings).toEqual([]);
  });

  it("computes lines in paise", () => {
    const [a, b, c] = invoice.items;
    expect(a).toMatchObject({
      gross: 2998,
      taxable: 2998,
      igst: 539.64,
      igstRate: 18,
      total: 3537.64,
    });
    // 5 × 299.50 = 1497.50, less 10% = 1347.75, IGST 242.595 → 242.60
    expect(b).toMatchObject({
      gross: 1497.5,
      discount: 149.75,
      taxable: 1347.75,
      igst: 242.6,
      unit: "NOS",
    });
    expect(c).toMatchObject({
      quantity: 1.5,
      unit: "HRS",
      taxable: 1200,
      igst: 216,
      isService: true,
    });
  });

  it("totals, round-off and words", () => {
    expect(invoice.totals).toEqual({
      gross: 5695.5,
      discount: 149.75,
      taxable: 5545.75,
      cgst: 0,
      sgst: 0,
      igst: 998.24,
      totalTax: 998.24,
      invoiceValue: 6543.99,
      roundOff: 0.01,
      amountPayable: 6544,
    });
    expect(invoice.amountInWords).toBe("Rupees Six Thousand Five Hundred Forty-Four Only");
    expect(invoice.formatted.amountPayable).toBe("₹6,544.00");
    expect(invoice.disclaimer).toBe(TAX_DISCLAIMER);
  });

  it("parses parties and dates", () => {
    expect(invoice.date).toBe("2026-11-04");
    expect(invoice.dateIndian).toBe("04-11-2026");
    expect(invoice.financialYear).toBe("2026-27");
    expect(invoice.seller.stateName).toBe("Karnataka");
    expect(invoice.buyer.address).toEqual(["Unit 4, Example Industrial Estate", "Andheri East"]);
  });

  it("builds a UPI request for the payable amount", () => {
    expect(invoice.upi).toEqual({
      uri: "upi://pay?pa=demotraders@okaxis&pn=Demo%20Traders%20Private%20Limited&am=6544.00&cu=INR&tn=Invoice%20BS%2F2026-27%2F001&tr=BS%2F2026-27%2F001",
      vpa: "demotraders@okaxis",
      payeeName: "Demo Traders Private Limited",
      amount: "6544.00",
    });
  });

  it("groups the HSN summary", () => {
    expect(invoice.hsnSummary.map((r) => [r.hsn, r.taxable, r.igst])).toEqual([
      ["8473", 2998, 539.64],
      ["8544", 1347.75, 242.6],
      ["998713", 1200, 216],
    ]);
  });
});

describe("createInvoice: intra-state", () => {
  it("splits CGST and SGST equally, handles zero-rated and amount discounts", () => {
    const { invoice } = ok(intraStateInput());
    expect(invoice.supplyType).toBe("INTRA_STATE");
    expect(invoice.stateTaxLabel).toBe("SGST");
    const [svc, books, food] = invoice.items;
    expect(svc).toMatchObject({ cgst: 900, sgst: 900, cgstRate: 9, sgstRate: 9, igst: 0 });
    expect(books).toMatchObject({ taxable: 99.99, cgst: 0, sgst: 0, total: 99.99 });
    // 2 × 105.25 = 210.50 − 10.50 = 200.00 at 5% → 5.00 + 5.00
    expect(food).toMatchObject({ taxable: 200, cgst: 5, sgst: 5 });
    expect(invoice.totals.cgst).toBe(invoice.totals.sgst);
    expect(invoice.totals.amountPayable).toBe(12110);
    expect(invoice.totals.roundOff).toBe(0.01);
  });

  it("uses UTGST in a UT without a legislature", () => {
    const { invoice } = ok({
      ...intraStateInput(),
      seller: { name: "UT Seller", gstin: GSTIN.CH },
      buyer: { name: "Walk-in", state: "Chandigarh" },
    });
    expect(invoice.supplyType).toBe("INTRA_STATE");
    expect(invoice.stateTaxLabel).toBe("UTGST");
    expect(invoice.buyer.gstin).toBeNull();
  });

  it("rounds each half of an odd tax amount separately", () => {
    const { invoice } = ok({
      ...intraStateInput(),
      items: [{ description: "x", hsn: "4820", quantity: 1, rate: 0.1, gstRate: 5 }],
    });
    // 10 paise × 2.5% = 0.25 paise → 0 each half
    expect(invoice.items[0]).toMatchObject({ cgst: 0, sgst: 0 });
  });

  it("supports sub-paise quantities and rates via decimal rounding", () => {
    const { invoice } = ok({
      ...intraStateInput(),
      items: [
        {
          description: "Wire",
          hsn: "8544",
          quantity: 2.0005,
          unit: "kgs",
          rate: 1.005,
          gstRate: 18,
        },
      ],
    });
    // qty → 2.001, rate → 1.01, gross = 2.02101 → 2.02
    expect(invoice.items[0]).toMatchObject({ quantity: 2.001, rate: 1.01, gross: 2.02 });
  });
});

describe("createInvoice: special supplies", () => {
  it("SEZ buyer in the same state gets IGST", () => {
    const input = intraStateInput();
    input.buyer = { ...input.buyer, sez: true };
    expect(ok(input).invoice.supplyType).toBe("INTER_STATE");
  });

  it("export (place of supply 96) gets IGST", () => {
    const input = { ...intraStateInput(), buyer: { name: "Overseas Co" }, placeOfSupply: "96" };
    const { invoice } = ok(input);
    expect(invoice.supplyType).toBe("INTER_STATE");
    expect(invoice.placeOfSupply.name).toBe("Other Country");
  });

  it("place of supply can be a state name and overrides the buyer state", () => {
    const { invoice } = ok({ ...intraStateInput(), placeOfSupply: "Tamil Nadu" });
    expect(invoice.placeOfSupply.code).toBe("33");
    expect(invoice.supplyType).toBe("INTER_STATE");
  });

  it("reverse charge: buyer pays GST to the government, not the seller", () => {
    const r = ok({ ...intraStateInput(), reverseCharge: true });
    expect(r.invoice.reverseCharge).toBe(true);
    expect(r.invoice.totals.invoiceValue).toBe(12109.99);
    expect(r.invoice.totals.amountPayable).toBe(10300); // taxable 10299.99 rounded
    expect(codes(r.warnings)).toContain("REVERSE_CHARGE");
  });

  it("can skip rounding", () => {
    const { invoice } = ok({ ...interStateInput(), roundOff: false });
    expect(invoice.totals.roundOff).toBe(0);
    expect(invoice.totals.amountPayable).toBe(6543.99);
    expect(invoice.amountInWords).toBe(
      "Rupees Six Thousand Five Hundred Forty-Three and Ninety-Nine Paise Only",
    );
  });
});

describe("createInvoice: validation", () => {
  const err = (patch: Partial<InvoiceInput>) =>
    codes(createInvoice({ ...intraStateInput(), ...patch }).errors);
  const item = (patch: Record<string, unknown>) =>
    err({
      items: [{ description: "x", hsn: "4820", quantity: 1, rate: 10, gstRate: 18, ...patch }],
    });

  it("checks the invoice number (Rule 46)", () => {
    expect(err({ invoiceNo: "" })).toContain("INVOICE_NO_REQUIRED");
    expect(err({ invoiceNo: "INV-2026-27-000001" })).toContain("INVOICE_NO_LENGTH");
    expect(err({ invoiceNo: "INV#1" })).toContain("INVOICE_NO_CHARS");
  });

  it("checks dates, parties and place of supply", () => {
    expect(err({ date: "31-02-2026" })).toContain("DATE_INVALID");
    expect(err({ seller: { name: "No GSTIN" } })).toContain("SELLER_GSTIN_REQUIRED");
    expect(err({ seller: { name: "", gstin: GSTIN.KA } })).toContain("SELLER_NAME");
    const badChecksum = GSTIN.KA.slice(0, 14) + (GSTIN.KA[14] === "0" ? "1" : "0");
    expect(err({ seller: { name: "Bad", gstin: badChecksum } })).toContain("SELLER_GSTIN_CHECKSUM");
    expect(err({ buyer: { name: "B", stateCode: "88" } })).toEqual(
      expect.arrayContaining(["BUYER_STATE", "POS_REQUIRED"]),
    );
    expect(err({ buyer: { name: "B" } })).toContain("POS_REQUIRED");
    expect(err({ placeOfSupply: "Atlantis" })).toContain("POS_INVALID");
    expect(err({ items: [] })).toContain("ITEMS_REQUIRED");
  });

  it("checks items", () => {
    expect(item({ description: " " })).toContain("ITEM_DESCRIPTION");
    expect(item({ quantity: 0 })).toContain("QTY_INVALID");
    expect(item({ quantity: 0.0001 })).toContain("QTY_INVALID");
    expect(item({ quantity: 1e300 })).toContain("QTY_INVALID");
    expect(item({ rate: -1 })).toContain("RATE_INVALID");
    expect(item({ rate: "abc" })).toContain("AMOUNT_INVALID");
    expect(item({ gstRate: -5 })).toContain("GST_RATE_INVALID");
    expect(item({ gstRate: 18.123 })).toContain("GST_RATE_INVALID");
    expect(item({ discount: 11 })).toContain("DISCOUNT_INVALID");
    expect(item({ discount: { percent: 120 } })).toContain("DISCOUNT_INVALID");
    expect(item({ hsn: "12AB" })).toContain("HSN_FORMAT");
  });

  it("reports a bad UPI ID", () => {
    expect(
      codes(createInvoice({ ...interStateInput(), upi: { vpa: "not-a-vpa" } }).errors),
    ).toEqual(["VPA_FORMAT"]);
  });
});

describe("createInvoice: warnings", () => {
  const warn = (patch: Partial<InvoiceInput>) =>
    codes(createInvoice({ ...intraStateInput(), ...patch }).warnings);

  it("flags GST rates that are not a slab on the invoice date", () => {
    const items = [{ description: "Chair", hsn: "9401", quantity: 1, rate: 100, gstRate: 12 }];
    expect(warn({ items })).toContain("GST_RATE_UNUSUAL");
    expect(warn({ items, date: "15-06-2025" })).not.toContain("GST_RATE_UNUSUAL");
    const sinGoods = [{ description: "Chair", hsn: "9401", quantity: 1, rate: 100, gstRate: 40 }];
    expect(warn({ items: sinGoods, date: "15-06-2025" })).toContain("GST_RATE_UNUSUAL");
  });

  it("guides HSN digits by turnover and flags missing HSN on B2B", () => {
    expect(warn({ sellerTurnover: "6,00,00,000" })).toContain("HSN_DIGITS");
    expect(warn({ sellerTurnover: 40_000_000 })).not.toContain("HSN_DIGITS");
    expect(warn({ items: [{ description: "x", quantity: 1, rate: 1, gstRate: 18 }] })).toContain(
      "HSN_MISSING",
    );
    expect(
      warn({
        buyer: { name: "B2C", state: "Karnataka" },
        items: [{ description: "x", quantity: 1, rate: 1, gstRate: 18 }],
      }),
    ).not.toContain("HSN_MISSING");
  });

  it("flags a state that contradicts the GSTIN, and legacy codes", () => {
    expect(warn({ buyer: { name: "B", gstin: GSTIN.KA2, state: "Kerala" } })).toContain(
      "BUYER_STATE_MISMATCH",
    );
    expect(warn({ placeOfSupply: "25" })).toContain("POS_LEGACY");
    expect(
      warn({ seller: { name: "Old", gstin: generateTestGSTIN("25", { seed: 9 }) } }),
    ).toContain("SELLER_GSTIN_STATE_LEGACY");
  });
});
