import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
  BharatInputError,
  createInvoice,
  type Invoice,
  type InvoiceInput,
  invoicesToTallyXml,
} from "../src/index.js";
import { GSTIN, interStateInput, intraStateInput } from "./fixtures.js";

const make = (input: InvoiceInput): Invoice => {
  const r = createInvoice(input);
  if (!r.invoice) throw new Error(JSON.stringify(r.errors));
  return r.invoice;
};
const parser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name.endsWith(".LIST") || name === "TALLYMESSAGE" || name === "IMPORTDATA",
});

/** Every voucher: amounts sum to zero; every ledger used is defined in the masters. */
function checkBooks(xml: string) {
  expect(XMLValidator.validate(xml)).toBe(true);
  const doc = parser.parse(xml);
  const imports = doc.ENVELOPE.BODY.IMPORTDATA as any[];
  const masters = imports.find((i) => i.REQUESTDESC.REPORTNAME === "All Masters");
  const defined = new Set<string>(
    (masters?.REQUESTDATA.TALLYMESSAGE ?? []).map((m: any) => m.LEDGER["@_NAME"]),
  );
  const vouchers = imports
    .find((i) => i.REQUESTDESC.REPORTNAME === "Vouchers")
    .REQUESTDATA.TALLYMESSAGE.map((m: any) => m.VOUCHER);
  for (const v of vouchers) {
    const entries = v["ALLLEDGERENTRIES.LIST"] as any[];
    const total = entries.reduce((s, e) => s + Math.round(Number(e.AMOUNT) * 100), 0);
    expect(total).toBe(0);
    for (const e of entries) {
      if (masters) expect(defined.has(String(e.LEDGERNAME))).toBe(true);
      expect(e.ISDEEMEDPOSITIVE).toBe(Number(e.AMOUNT) < 0 ? "Yes" : "No");
    }
  }
  return { vouchers, defined };
}

describe("invoicesToTallyXml", () => {
  it("golden: inter-state sales voucher", () => {
    const r = invoicesToTallyXml(make(interStateInput()), { companyName: "Demo Traders" });
    expect(r.xml).toMatchSnapshot();
    const { vouchers } = checkBooks(r.xml);
    expect(vouchers[0].DATE).toBe(20261104);
    expect(r.vouchers[0]).toEqual({
      voucherNumber: "BS/2026-27/001",
      date: "04-11-2026",
      party: "Sample Buyer LLP",
      debit: 6544,
      credit: 6544,
      entries: [
        { ledger: "Sample Buyer LLP", amount: 6544, side: "Dr" },
        { ledger: "Sales @ 18%", amount: 5545.75, side: "Cr" },
        { ledger: "Output IGST", amount: 998.24, side: "Cr" },
        { ledger: "Round Off", amount: 0.01, side: "Cr" },
      ],
    });
    expect(r.ledgers.map((l) => [l.name, l.group])).toEqual([
      ["Sample Buyer LLP", "Sundry Debtors"],
      ["Sales @ 18%", "Sales Accounts"],
      ["Output IGST", "Duties & Taxes"],
      ["Round Off", "Indirect Expenses"],
    ]);
    expect(r.xml).toContain("<PARENT>Duties &amp; Taxes</PARENT>");
  });

  it("intra-state: CGST + SGST, ledgers per rate, nil-rated ledger", () => {
    const r = invoicesToTallyXml(make(intraStateInput()));
    checkBooks(r.xml);
    expect(r.ledgers.map((l) => l.name)).toEqual([
      "Local Client",
      "Sales @ 18%",
      "Sales - Nil Rated",
      "Sales @ 5%",
      "Output CGST",
      "Output SGST",
      "Round Off",
    ]);
    expect(r.xml).toContain("<GSTDUTYHEAD>Central Tax</GSTDUTYHEAD>");
    expect(r.xml).not.toContain("SVCURRENTCOMPANY");
  });

  it("UTGST and purchase vouchers (mirror image, party = seller)", () => {
    const inv = make({
      ...intraStateInput(),
      seller: { name: "UT Supplier & Co", gstin: GSTIN.CH },
      buyer: { name: "Us", state: "Chandigarh" },
    });
    const r = invoicesToTallyXml(inv, { voucherType: "Purchase" });
    const { vouchers } = checkBooks(r.xml);
    expect(r.ledgers[0]).toEqual({
      name: "UT Supplier & Co",
      group: "Sundry Creditors",
      kind: "party",
    });
    expect(r.ledgers.map((l) => l.name)).toContain("Input UTGST");
    expect(r.vouchers[0]?.entries[0]).toMatchObject({ ledger: "UT Supplier & Co", side: "Cr" });
    expect(vouchers[0].REFERENCEDATE).toBe(20261104);
    expect(vouchers[0].VOUCHERNUMBER).toBeUndefined();
    expect(r.xml).toContain('NAME="UT Supplier &amp; Co"');
  });

  it("negative round-off goes to the debit side", () => {
    const input = intraStateInput();
    input.items = [{ description: "x", hsn: "4820", quantity: 1, rate: 100.4, gstRate: 0 }];
    const r = invoicesToTallyXml(make(input));
    checkBooks(r.xml);
    expect(r.vouchers[0]?.entries.at(-1)).toEqual({ ledger: "Round Off", amount: 0.4, side: "Dr" });
  });

  it("reverse charge leaves GST out and warns", () => {
    const r = invoicesToTallyXml(make({ ...intraStateInput(), reverseCharge: true }));
    checkBooks(r.xml);
    expect(r.ledgers.some((l) => l.kind === "tax")).toBe(false);
    expect(r.warnings[0]?.code).toBe("TALLY_REVERSE_CHARGE");
    expect(r.xml).toContain("(reverse charge)");
  });

  it("batches invoices, supports custom ledger names and skipping masters", () => {
    const r = invoicesToTallyXml([make(interStateInput()), make(intraStateInput())], {
      includeMasters: false,
      ledgerNames: {
        salesOrPurchase: (rate) => `GST Sales ${rate}`,
        igst: "IGST Payable",
        cgst: "CGST Payable",
        sgst: "SGST Payable",
        roundOff: "Rounding",
      },
    });
    const { vouchers } = checkBooks(r.xml);
    expect(vouchers).toHaveLength(2);
    expect(r.xml).not.toContain("All Masters");
    expect(r.xml).toContain("<LEDGERNAME>IGST Payable</LEDGERNAME>");
    expect(r.xml).toContain("<LEDGERNAME>GST Sales 18</LEDGERNAME>");
    expect(r.xml).toContain("<LEDGERNAME>Rounding</LEDGERNAME>");
  });

  it("marks unregistered buyers and exports", () => {
    const inv = make({
      ...intraStateInput(),
      buyer: { name: "Overseas Buyer" },
      placeOfSupply: "96",
    });
    const r = invoicesToTallyXml(inv);
    checkBooks(r.xml);
    expect(r.xml).toContain("<GSTREGISTRATIONTYPE>Unregistered/Consumer</GSTREGISTRATIONTYPE>");
    expect(r.xml).toContain("<COUNTRYOFRESIDENCE>Other Country</COUNTRYOFRESIDENCE>");
  });

  it("rejects an empty batch", () => {
    expect(() => invoicesToTallyXml([])).toThrow(BharatInputError);
  });
});
