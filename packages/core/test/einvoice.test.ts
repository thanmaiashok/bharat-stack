import { describe, expect, it } from "vitest";
import {
  BharatInputError,
  createInvoice,
  EWAYBILL_BULK_VERSION,
  type Invoice,
  type InvoiceInput,
  invoicesToEWayBill,
  invoiceToEInvoice,
  listUQC,
  toUQC,
  validateEInvoiceSchema,
  validateEWayBillSchema,
} from "../src/index.js";
import { GSTIN, interStateInput, intraStateInput } from "./fixtures.js";

const make = (input: InvoiceInput): Invoice => {
  const r = createInvoice(input);
  if (!r.invoice) throw new Error(JSON.stringify(r.errors));
  return r.invoice;
};
const codes = (x: { code: string }[]) => x.map((i) => i.code);
const withAddresses = (input: InvoiceInput): InvoiceInput => ({
  ...input,
  seller: { ...input.seller, address: "1 Main Road", city: "Bengaluru", pincode: "560001" },
  buyer: { ...input.buyer, address: "2 Market Street", city: "Mysuru", pincode: "570001" },
});

describe("invoiceToEInvoice", () => {
  it("golden: inter-state B2B JSON passes the schema", () => {
    const r = invoiceToEInvoice(make(interStateInput()));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.json).toMatchSnapshot();
    expect(r.schemaVersion).toBe("1.1");
    expect(r.info[0]).toContain("Rs 5 crore");
    expect(r.info[1]).toContain("Rs 10 crore");
  });

  it("intra-state with unknown units, phone cleanup and pay details", () => {
    const input = withAddresses(intraStateInput());
    input.seller.phone = "+91 98450 00000";
    input.bank = { accountName: "Demo", accountNumber: "000000000000", ifsc: "EXMP0000001" };
    input.items[0] = { ...input.items[0]!, unit: "box" };
    input.items[2] = { ...input.items[2]!, unit: "crate" };
    const r = invoiceToEInvoice(make(input));
    expect(r.errors).toEqual([]);
    const j = r.json as any;
    expect(j.TranDtls).toEqual({ TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" });
    expect(j.SellerDtls.Ph).toBe("9845000000");
    expect(j.PayDtls).toEqual({ Nm: "Demo", AccDet: "000000000000", FinInsBr: "EXMP0000001" });
    expect(j.ItemList[0].Unit).toBe("BOX");
    expect(j.ItemList[2].Unit).toBe("OTH");
    expect(codes(r.warnings)).toEqual(["EINVOICE_UNIT"]);
  });

  it("SEZ in the same state: SEZWP with IgstOnIntra", () => {
    const input = withAddresses(intraStateInput());
    input.buyer.sez = true;
    const j = invoiceToEInvoice(make(input)).json as any;
    expect(j.TranDtls.SupTyp).toBe("SEZWP");
    expect(j.TranDtls.IgstOnIntra).toBe("Y");
  });

  it("export without tax: EXPWOP, URP buyer, state 96", () => {
    const input = withAddresses({ ...intraStateInput(), placeOfSupply: "96" });
    input.buyer = { name: "Overseas Buyer Inc", address: "5 Example Ave", city: "Springfield" };
    input.items = input.items.map((i) => ({ ...i, gstRate: 0 }));
    const r = invoiceToEInvoice(make(input), {
      export: {
        port: "INBLR4",
        countryCode: "US",
        currency: "USD",
        shippingBillNo: "1234567",
        shippingBillDate: "05/11/2026",
      },
    });
    expect(r.errors).toEqual([]);
    const j = r.json as any;
    expect(j.TranDtls.SupTyp).toBe("EXPWOP");
    expect(j.BuyerDtls).toMatchObject({ Gstin: "URP", Pos: "96", Stcd: "96", Pin: 999999 });
    expect(j.ExpDtls).toEqual({
      ShipBNo: "1234567",
      ShipBDt: "05/11/2026",
      Port: "INBLR4",
      ForCur: "USD",
      CntCode: "US",
    });
  });

  it("export with IGST and SEZ without tax", () => {
    const exp = withAddresses({ ...intraStateInput(), placeOfSupply: "96" });
    exp.buyer = { name: "Overseas Buyer Inc", address: "5 Example Ave", city: "Springfield" };
    expect((invoiceToEInvoice(make(exp)).json as any).TranDtls.SupTyp).toBe("EXPWP");
    const sez = withAddresses(intraStateInput());
    sez.buyer.sez = true;
    sez.items = sez.items.map((i) => ({ ...i, gstRate: 0 }));
    expect((invoiceToEInvoice(make(sez)).json as any).TranDtls.SupTyp).toBe("SEZWOP");
  });

  it("reverse charge, e-commerce GSTIN and supply-type override", () => {
    const inv = make({ ...interStateInput(), reverseCharge: true });
    const j = invoiceToEInvoice(inv, { ecomGstin: GSTIN.KA2, supplyType: "DEXP" }).json as any;
    expect(j.TranDtls).toMatchObject({ RegRev: "Y", EcmGstin: GSTIN.KA2, SupTyp: "DEXP" });
    expect(j.ValDtls.RndOffAmt).toBe(0);
    expect(j.ValDtls.TotInvVal).toBe(inv.totals.invoiceValue);
  });

  it("rejects B2C and missing address details", () => {
    const b2c = invoiceToEInvoice(
      make({ ...interStateInput(), buyer: { name: "Consumer", state: "Maharashtra" } }),
    );
    expect(b2c.ok).toBe(false);
    expect(b2c.json).toBeNull();
    expect(codes(b2c.errors)).toEqual(
      expect.arrayContaining(["EINVOICE_B2C", "BUYER_ADDRESS", "BUYER_CITY", "BUYER_PINCODE"]),
    );
    const noHsn = withAddresses(intraStateInput());
    noHsn.items = [{ description: "Thing", quantity: 1, rate: 10, gstRate: 18 }];
    expect(codes(invoiceToEInvoice(make(noHsn)).errors)).toContain("EINVOICE_HSN");
  });

  it("reports schema errors with a path", () => {
    const r = invoiceToEInvoice(make(withAddresses({ ...intraStateInput(), invoiceNo: "0042" })));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ code: "EINVOICE_SCHEMA", path: "/DocDtls/No" });
  });
});

describe("invoicesToEWayBill", () => {
  const transport = { mode: "road" as const, distanceKm: 980, vehicleNo: "ka-01-ab-1234" };

  it("golden: goods lines only, with a threshold note", () => {
    const r = invoicesToEWayBill(make(interStateInput()), { transport });
    expect(r.ok).toBe(true);
    expect(r.json).toMatchSnapshot();
    expect(r.json?.version).toBe(EWAYBILL_BULK_VERSION);
    expect(codes(r.warnings)).toEqual(["EWB_SERVICES_SKIPPED"]);
    expect(r.info[0]).toContain("generally not mandatory");
  });

  it("batches invoices, inward direction, transport document", () => {
    const big = withAddresses(intraStateInput());
    big.items = [
      { description: "Steel rods", hsn: "7214", quantity: 100, unit: "kg", rate: 650, gstRate: 18 },
    ];
    const r = invoicesToEWayBill([make(big), make(big)], {
      transport: { mode: "rail", distanceKm: 150, docNo: "RR123", docDate: "06-11-2026" },
      direction: "inward",
      actualToStateCode: "33",
    });
    expect(r.errors).toEqual([]);
    const b = r.json?.billLists[0] as any;
    expect(r.json?.billLists).toHaveLength(2);
    expect(b).toMatchObject({
      supplyType: "I",
      userGstin: GSTIN.KA2,
      transMode: 2,
      transDocNo: "RR123",
      transDocDate: "06/11/2026",
      actualToStateCode: 33,
      mainHsnCode: 7214,
    });
    expect(b.itemList[0]).toMatchObject({ qtyUnit: "KGS", cgstRate: 9, sgstRate: 9, igstRate: 0 });
    expect(r.info.some((i) => i.includes("generally not mandatory"))).toBe(false);
  });

  it("export: URP buyer and state 99", () => {
    const exp = withAddresses({ ...intraStateInput(), placeOfSupply: "96" });
    exp.buyer = { name: "Overseas Buyer Inc", address: "5 Example Ave", city: "Springfield" };
    const r = invoicesToEWayBill(make(exp), {
      transport: { mode: "ship", distanceKm: 20, transporterId: GSTIN.KA2 },
    });
    expect(r.errors).toEqual([]);
    expect(r.json?.billLists[0]).toMatchObject({
      subSupplyType: 3,
      toGstin: "URP",
      toStateCode: 99,
      toPincode: 999999,
    });
  });

  it("validates transport and goods", () => {
    const inv = make(interStateInput());
    const err = (t: object) =>
      codes(invoicesToEWayBill(inv, { transport: { ...transport, ...t } as any }).errors);
    expect(err({ distanceKm: 5000 })).toContain("EWB_DISTANCE");
    expect(err({ distanceKm: 1.5 })).toContain("EWB_DISTANCE");
    expect(err({ mode: "rocket" })).toContain("EWB_MODE");
    expect(err({ vehicleNo: undefined })).toContain("EWB_VEHICLE");
    expect(
      codes(invoicesToEWayBill(inv, { transport: { ...transport, vehicleNo: "HELLO1" } }).warnings),
    ).toContain("EWB_VEHICLE_FORMAT");

    const services = make({
      ...interStateInput(),
      items: [{ description: "Consulting", hsn: "998311", quantity: 1, rate: 100000, gstRate: 18 }],
    });
    expect(codes(invoicesToEWayBill(services, { transport }).errors)).toContain("EWB_NO_GOODS");
    const noHsn = make({
      ...interStateInput(),
      items: [{ description: "Box", quantity: 1, rate: 100000, gstRate: 18 }],
    });
    expect(codes(invoicesToEWayBill(noHsn, { transport }).errors)).toContain("EWB_HSN");
    const noPin = make(intraStateInput());
    expect(codes(invoicesToEWayBill(noPin, { transport }).errors)).toContain("EWB_PINCODE");
    expect(codes(invoicesToEWayBill(inv, { transport, version: "x".repeat(30) }).errors)).toContain(
      "EWB_SCHEMA",
    );
    expect(() => invoicesToEWayBill([], { transport })).toThrow(BharatInputError);
  });
});

describe("schema validators and UQC", () => {
  it("explain what is wrong", () => {
    const errs = validateEInvoiceSchema({ Version: "1.1.0000", Extra: 1 });
    const text = errs.map((e) => `${e.path} ${e.message}`).join("\n");
    expect(text).toContain("must have required property 'TranDtls'");
    expect(text).toContain("must NOT have more than 6 characters");
    expect(text).toContain('must NOT have additional properties: "Extra"');
    expect(validateEWayBillSchema({ version: "1", billLists: [] }).length).toBeGreaterThan(0);
  });

  it("maps units to GST UQC", () => {
    expect(toUQC("kg")).toEqual({ code: "KGS", known: true });
    expect(toUQC("Pcs.")).toEqual({ code: "PCS", known: true });
    expect(toUQC("hrs")).toEqual({ code: "OTH", known: false });
    expect(toUQC(undefined)).toEqual({ code: "OTH", known: false });
    expect(listUQC()).toHaveLength(45);
  });
});
