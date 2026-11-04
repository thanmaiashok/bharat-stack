import type { Issue } from "../errors.js";
import type { DateInput } from "../formats/date.js";
import type { Amount } from "../money.js";

export interface PartyInput {
  name: string;
  /** Required for the seller. Optional for the buyer (B2C). */
  gstin?: string;
  /** One string or several lines. */
  address?: string | string[];
  city?: string;
  pincode?: string;
  /** GST state code ("29"). Taken from the GSTIN when present. */
  stateCode?: string;
  /** State name ("Karnataka"), used when there is no GSTIN or stateCode. */
  state?: string;
  phone?: string;
  email?: string;
  /** Buyer is a Special Economic Zone unit/developer: always IGST. */
  sez?: boolean;
}

export type Discount = Amount | { percent: number };

export interface InvoiceItemInput {
  description: string;
  /** HSN (goods) or SAC (services, starts with 99). */
  hsn?: string;
  quantity: number;
  /** Unit, e.g. NOS, KGS, HRS. Default NOS. */
  unit?: string;
  /** Price per unit, before GST. */
  rate: Amount;
  /** GST rate in percent, e.g. 18. */
  gstRate: number;
  /** Discount on the line, as an amount or { percent }. */
  discount?: Discount;
}

export interface InvoiceInput {
  invoiceNo: string;
  date: DateInput;
  seller: PartyInput;
  buyer: PartyInput;
  /** Place of supply state code. Defaults to the buyer's state. */
  placeOfSupply?: string;
  items: InvoiceItemInput[];
  reverseCharge?: boolean;
  /** Round the payable amount to the nearest rupee. Default true. */
  roundOff?: boolean;
  /** Seller's aggregate annual turnover in rupees; decides 4- vs 6-digit HSN guidance. */
  sellerTurnover?: Amount;
  /** Add a UPI payment request for the amount payable. */
  upi?: { vpa: string; payeeName?: string };
  bank?: {
    name?: string;
    accountName?: string;
    accountNumber?: string;
    ifsc?: string;
    branch?: string;
  };
  notes?: string;
  terms?: string;
}

export interface Party {
  name: string;
  gstin: string | null;
  address: string[];
  city: string | null;
  pincode: string | null;
  stateCode: string | null;
  stateName: string | null;
  phone: string | null;
  email: string | null;
  sez: boolean;
}

export interface InvoiceLine {
  sl: number;
  description: string;
  hsn: string | null;
  isService: boolean;
  quantity: number;
  unit: string;
  rate: number;
  gross: number;
  discount: number;
  taxable: number;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface HsnSummaryRow {
  hsn: string;
  gstRate: number;
  quantity: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

export interface InvoiceTotals {
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  /** Taxable value + all GST. */
  invoiceValue: number;
  roundOff: number;
  /** What the buyer pays the seller. Excludes GST under reverse charge. */
  amountPayable: number;
}

/** All amounts are rupees with at most 2 decimals; computed from integer paise. */
export interface Invoice {
  schema: "bharat-stack/invoice@1";
  documentType: "TAX_INVOICE";
  invoiceNo: string;
  /** ISO date */
  date: string;
  dateIndian: string;
  financialYear: string;
  seller: Party;
  buyer: Party;
  placeOfSupply: { code: string; name: string };
  supplyType: "INTRA_STATE" | "INTER_STATE";
  /** "SGST" or "UTGST" (only meaningful for intra-state). */
  stateTaxLabel: "SGST" | "UTGST";
  reverseCharge: boolean;
  items: InvoiceLine[];
  hsnSummary: HsnSummaryRow[];
  totals: InvoiceTotals;
  amountInWords: string;
  formatted: { amountPayable: string; invoiceValue: string; totalTax: string };
  upi: { uri: string; vpa: string; payeeName: string; amount: string } | null;
  bank: InvoiceInput["bank"] | null;
  notes: string | null;
  terms: string | null;
  disclaimer: string;
}

export interface InvoiceResult {
  ok: boolean;
  invoice: Invoice | null;
  errors: Issue[];
  warnings: Issue[];
  disclaimer: string;
}
