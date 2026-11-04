// Regenerates the files in examples/ from the built packages.
// Run: pnpm build && node scripts/generate-examples.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createInvoice,
  generateTestGSTIN,
  invoicesToEWayBill,
  invoicesToTallyXml,
  invoiceToEInvoice,
} from "@bharat-stack/core";
import { renderInvoiceHtml, renderInvoicePdf, upiQr } from "@bharat-stack/render";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
const write = (rel, data) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log("wrote", rel);
};

// Synthetic identifiers only.
const sellerKA = generateTestGSTIN("29", { seed: 1 });
const buyerMH = generateTestGSTIN("27", { seed: 2 });
const buyerKA = generateTestGSTIN("29", { seed: 11 });

const examples = {
  "bengaluru-to-mumbai": {
    invoiceNo: "BS/2026-27/001",
    date: "04-11-2026",
    seller: {
      name: "Demo Traders Private Limited",
      gstin: sellerKA,
      address: ["No. 12, 1st Cross, MG Road"],
      city: "Bengaluru",
      pincode: "560001",
      email: "accounts@example.com",
    },
    buyer: {
      name: "Sample Buyer LLP",
      gstin: buyerMH,
      address: ["Unit 4, Example Industrial Estate, Andheri East"],
      city: "Mumbai",
      pincode: "400069",
    },
    items: [
      {
        description: "Aluminium laptop stand, adjustable height",
        hsn: "8473",
        quantity: 2,
        rate: 1499,
        gstRate: 18,
      },
      {
        description: "USB-C to USB-C cable 1m",
        hsn: "8544",
        quantity: 5,
        rate: 299.5,
        gstRate: 18,
        discount: { percent: 10 },
      },
      {
        description: "On-site setup service",
        hsn: "998713",
        quantity: 1.5,
        unit: "hrs",
        rate: 800,
        gstRate: 18,
      },
    ],
    upi: { vpa: "demotraders@okaxis" },
    bank: {
      name: "Example Bank",
      accountName: "Demo Traders Pvt Ltd",
      accountNumber: "000000000000",
      ifsc: "EXMP0000001",
    },
    terms: "Payment due within 15 days.",
  },
  "bengaluru-intra-state": {
    invoiceNo: "BS/2026-27/002",
    date: "05-11-2026",
    seller: { name: "Demo Traders Private Limited", gstin: sellerKA, city: "Bengaluru" },
    buyer: { name: "Local Client Pvt Ltd", gstin: buyerKA, city: "Mysuru" },
    items: [
      {
        description: "Website maintenance (November)",
        hsn: "998314",
        quantity: 1,
        rate: 15000,
        gstRate: 18,
      },
      { description: "Printed brochures", hsn: "4911", quantity: 500, rate: 6.4, gstRate: 18 },
      { description: "Printed books", hsn: "4901", quantity: 3, rate: 350, gstRate: 0 },
    ],
    upi: { vpa: "demotraders@okaxis" },
  },
};

const computed = [];
for (const [name, input] of Object.entries(examples)) {
  const result = createInvoice(input);
  if (!result.invoice) throw new Error(`${name}: ${JSON.stringify(result.errors)}`);
  write(`gst-invoice/${name}.input.json`, `${JSON.stringify(input, null, 2)}\n`);
  write(`gst-invoice/${name}.json`, `${JSON.stringify(result, null, 2)}\n`);
  write(`gst-invoice/${name}.pdf`, await renderInvoicePdf(result.invoice));
  write(`gst-invoice/${name}.html`, renderInvoiceHtml(result.invoice));
  computed.push(result.invoice);
}

// Tally: one file with masters + vouchers, and the same split in two.
const tally = invoicesToTallyXml(computed, { companyName: "Demo Traders Private Limited" });
write("tally/sales-vouchers.xml", tally.xml);
write("tally/masters-only.xml", tally.mastersXml);
write("tally/vouchers-only.xml", tally.vouchersXml);

// E-invoice and e-way bill files (generated only; never submitted).
const einv = invoiceToEInvoice(computed[0]);
if (!einv.ok) throw new Error(`e-invoice: ${JSON.stringify(einv.errors)}`);
write("einvoice/bengaluru-to-mumbai.einvoice.json", `${JSON.stringify(einv.json, null, 2)}\n`);
const ewb = invoicesToEWayBill(computed[0], {
  transport: { mode: "road", distanceKm: 980, vehicleNo: "KA01AB1234" },
});
if (!ewb.ok) throw new Error(`e-way bill: ${JSON.stringify(ewb.errors)}`);
write("einvoice/bengaluru-to-mumbai.ewaybill.json", `${JSON.stringify(ewb.json, null, 2)}\n`);

const qr = await upiQr({
  vpa: "demotraders@okaxis",
  payeeName: "Demo Traders",
  amount: 499,
  note: "Order 1042",
});
write("upi-qr/demo-499.svg", `${qr.svg}\n`);
write("upi-qr/demo-499.png", qr.png);
write("upi-qr/demo-499.txt", `${qr.uri}\n`);
