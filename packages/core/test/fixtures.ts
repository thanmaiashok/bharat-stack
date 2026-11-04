import { generateTestGSTIN, type InvoiceInput } from "../src/index.js";

/** All identifiers here are synthetic (generated), never real businesses. */
export const GSTIN = {
  KA: generateTestGSTIN("29", { seed: 1 }),
  KA2: generateTestGSTIN("29", { seed: 11 }),
  MH: generateTestGSTIN("27", { seed: 2 }),
  CH: generateTestGSTIN("04", { seed: 3 }),
};

/** Bengaluru seller → Mumbai buyer, 3 items, UPI. The README demo. */
export function interStateInput(): InvoiceInput {
  return {
    invoiceNo: "BS/2026-27/001",
    date: "04-11-2026",
    seller: {
      name: "Demo Traders Private Limited",
      gstin: GSTIN.KA,
      address: ["No. 12, 1st Cross, MG Road"],
      city: "Bengaluru",
      pincode: "560001",
      phone: "+91 80 0000 0000",
      email: "accounts@example.com",
    },
    buyer: {
      name: "Sample Buyer LLP",
      gstin: GSTIN.MH,
      address: "Unit 4, Example Industrial Estate\nAndheri East",
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
      branch: "MG Road",
    },
    notes: "Thank you for your business.",
    terms: "Payment due within 15 days.",
  };
}

/** Bengaluru → Bengaluru: CGST + SGST. */
export function intraStateInput(): InvoiceInput {
  return {
    invoiceNo: "BS-002",
    date: "2026-11-04",
    seller: { name: "Demo Traders", gstin: GSTIN.KA },
    buyer: { name: "Local Client", gstin: GSTIN.KA2 },
    items: [
      { description: "Consulting", hsn: "998311", quantity: 1, rate: 10000, gstRate: 18 },
      { description: "Printed books", hsn: "4901", quantity: 3, rate: 33.33, gstRate: 0 },
      {
        description: "Packaged food",
        hsn: "2106",
        quantity: 2,
        rate: 105.25,
        gstRate: 5,
        discount: 10.5,
      },
    ],
  };
}
