import { createInvoice, type Invoice, type InvoiceInput } from "@bharat-stack/core";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { interStateInput, intraStateInput } from "../../core/test/fixtures.js";
import {
  invoiceLayout,
  layoutText,
  qrMatrix,
  qrPng,
  qrSvg,
  renderInvoiceHtml,
  renderInvoicePdf,
  upiQr,
} from "../src/index.js";

const make = (input: InvoiceInput): Invoice => {
  const r = createInvoice(input);
  if (!r.invoice) throw new Error(JSON.stringify(r.errors));
  return r.invoice;
};

describe("QR", () => {
  it("makes a square matrix and deterministic SVG", () => {
    const m = qrMatrix("upi://pay?pa=ab@upi&pn=A&cu=INR");
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every((row) => row.length === m.length)).toBe(true);
    const svg = qrSvg("hello", { size: 100, margin: 2 });
    expect(svg).toBe(qrSvg("hello", { size: 100, margin: 2 }));
    expect(svg).toMatch(/^<svg [^>]*width="100"/);
    expect(svg).toContain("<title>QR code</title>");
    expect(qrSvg("x", { title: "A & <B>" })).toContain("<title>A &amp; &lt;B></title>");
  });

  it("makes PNGs and a combined UPI QR", async () => {
    const png = await qrPng("hello");
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const u = await upiQr({ vpa: "ab@upi", payeeName: "A", amount: 10 });
    expect(u.uri).toContain("am=10.00");
    expect(u.svg).toContain("<svg");
    expect(u.png.length).toBeGreaterThan(100);
  });
});

describe("PDF", () => {
  it("golden: inter-state invoice text layout", async () => {
    const pages = layoutText(await invoiceLayout(make(interStateInput())));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchSnapshot();
  });

  it("golden: intra-state invoice text layout", async () => {
    const pages = layoutText(
      await invoiceLayout(make({ ...intraStateInput(), reverseCharge: true }), {
        copyLabel: "Duplicate for Transporter",
        footer: "Custom footer",
      }),
    );
    expect(pages[0]).toMatchSnapshot();
  });

  it("renders a valid, deterministic A4 PDF", async () => {
    const inv = make(interStateInput());
    const a = await renderInvoicePdf(inv);
    const b = await renderInvoicePdf(inv);
    expect(Buffer.from(a).toString("latin1", 0, 5)).toBe("%PDF-");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const doc = await PDFDocument.load(a);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe("Tax Invoice BS/2026-27/001");
    expect(Math.round(doc.getPage(0).getWidth())).toBe(595);
  });

  it("paginates long invoices and repeats the table header", async () => {
    const input = intraStateInput();
    input.items = Array.from({ length: 60 }, (_, i) => ({
      description: `Item ${i + 1} with a long description that needs to wrap onto a second line in the table`,
      hsn: "4820",
      quantity: 1,
      rate: 10,
      gstRate: 18,
    }));
    const inv = make(input);
    const pages = layoutText(await invoiceLayout(inv));
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[1]).toContain("BS-002 (continued)");
    expect(pages.at(-1)).toContain(`Page ${pages.length} of ${pages.length}`);
    const doc = await PDFDocument.load(await renderInvoicePdf(inv));
    expect(doc.getPageCount()).toBe(pages.length);
  });

  it("replaces characters the PDF font cannot draw", async () => {
    const input = intraStateInput();
    input.items = [
      {
        description: "Kurta – ₹ special “cotton” नमस्ते",
        hsn: "6211",
        quantity: 1,
        rate: 100,
        gstRate: 5,
      },
    ];
    input.seller = { ...input.seller, name: "Seller…" };
    const text = layoutText(await invoiceLayout(make(input)))
      .flat()
      .join("\n");
    expect(text).toContain('Kurta - Rs. special "cotton"');
    expect(text).toContain("??????");
    expect(text).toContain("Seller...");
  });

  it("hard-wraps very long words and works without UPI or bank details", async () => {
    const input = intraStateInput();
    input.items = [
      { description: "X".repeat(120), hsn: "4820", quantity: 1, rate: 1, gstRate: 18 },
    ];
    input.buyer = {
      name: "SEZ Unit",
      gstin: input.buyer.gstin as string,
      sez: true,
      address: "Plot 1",
    };
    const pages = layoutText(await invoiceLayout(make(input)));
    expect(pages[0]?.filter((t) => /^X+$/.test(t)).length).toBeGreaterThan(1);
    expect(pages[0]).toContain("SEZ unit");
  });
});

describe("HTML", () => {
  it("renders inter-state with IGST and an inline QR", () => {
    const html = renderInvoiceHtml(make(interStateInput()));
    expect(html).toContain("<title>Tax Invoice BS/2026-27/001</title>");
    expect(html).toContain("<th>IGST</th>");
    expect(html).not.toContain("<th>CGST</th>");
    expect(html).toContain("<svg");
    expect(html).toContain("₹6,544.00");
  });

  it("renders intra-state with CGST/SGST and escapes user text", () => {
    const input = intraStateInput();
    input.buyer = { ...input.buyer, name: "<script>alert(1)</script>" };
    input.notes = 'Fragile & "handle" with care';
    input.terms = "Net 30";
    const html = renderInvoiceHtml(make({ ...input, reverseCharge: true }));
    expect(html).toContain("<th>CGST</th><th>SGST</th>");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Fragile &amp; &quot;handle&quot; with care");
    expect(html).toContain("GST payable by recipient (RCM)");
  });
});
