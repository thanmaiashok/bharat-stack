import { BharatInputError, type Issue } from "./errors.js";
import { type Amount, paiseToDecimalString, toPaise } from "./money.js";

export interface UpiPaymentInput {
  /** Payee UPI ID (VPA), e.g. "shop@okaxis". */
  vpa: string;
  /** Payee name shown in the payer's app. */
  payeeName: string;
  /** Fixed amount in rupees. Omit to let the payer enter it. */
  amount?: Amount;
  /** Transaction note (tn), e.g. "Invoice INV-001". */
  note?: string;
  /** Transaction reference (tr), e.g. the invoice number. */
  txnRef?: string;
}

export interface UpiPayment {
  uri: string;
  vpa: string;
  payeeName: string;
  /** "1234.50" or null */
  amount: string | null;
  warnings: Issue[];
  note: string;
}

const VPA = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function validateVPA(vpa: string): { valid: boolean; normalized: string; errors: Issue[] } {
  const normalized = vpa.trim();
  const errors: Issue[] = [];
  if (!VPA.test(normalized)) {
    errors.push({
      code: "VPA_FORMAT",
      message: `"${vpa}" is not a valid UPI ID. Expected name@bank, e.g. shop@okaxis.`,
    });
  }
  return { valid: errors.length === 0, normalized, errors };
}

const enc = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/**
 * Build a upi://pay link for a static QR code. This only describes a payment request;
 * it can never confirm that a payment was made.
 */
export function buildUpiUri(input: UpiPaymentInput): UpiPayment {
  const vpa = validateVPA(input.vpa);
  if (!vpa.valid) throw new BharatInputError("VPA_FORMAT", vpa.errors[0]?.message ?? "Invalid VPA");
  const payeeName = input.payeeName.trim();
  if (!payeeName) throw new BharatInputError("UPI_PAYEE_NAME", "payeeName is required.");
  const warnings: Issue[] = [];
  const params: [string, string][] = [
    ["pa", vpa.normalized],
    ["pn", payeeName],
  ];
  let amount: string | null = null;
  if (input.amount !== undefined) {
    const paise = toPaise(input.amount);
    if (paise <= 0)
      throw new BharatInputError("UPI_AMOUNT", "UPI amount must be greater than zero.");
    amount = paiseToDecimalString(paise);
    params.push(["am", amount]);
  }
  params.push(["cu", "INR"]);
  if (input.note) {
    if (input.note.length > 80) {
      warnings.push({
        code: "UPI_NOTE_LONG",
        message: "Some UPI apps cut notes longer than 80 characters.",
      });
    }
    params.push(["tn", input.note]);
  }
  if (input.txnRef) params.push(["tr", input.txnRef]);
  // Keep "@" readable in the UPI ID; some apps do not decode %40 in pa.
  const uri = `upi://pay?${params.map(([k, v]) => `${k}=${k === "pa" ? enc(v).replace(/%40/g, "@") : enc(v)}`).join("&")}`;
  return {
    uri,
    vpa: vpa.normalized,
    payeeName,
    amount,
    warnings,
    note: "Static payment request only. Scanning it does not confirm payment; check your bank or UPI app.",
  };
}
