import { BharatInputError } from "./errors.js";

/** An amount in rupees, as a number (12345.5) or a decimal string ("12,345.50", "₹ 12345.5"). */
export type Amount = number | string;

const DECIMAL = /^(-)?(\d+)(?:\.(\d*))?$/;

/**
 * Convert rupees to integer paise, rounding half away from zero at the 3rd decimal.
 * Works on the decimal text of the number, so 1.005 becomes 101 paise (not 100).
 */
export function toPaise(amount: Amount): number {
  let text: string;
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) {
      throw new BharatInputError(
        "AMOUNT_NOT_FINITE",
        `Amount must be a finite number, got ${amount}`,
      );
    }
    text = String(amount);
    // Very small numbers stringify as "1e-7"; they round to 0 paise anyway.
    if (/e-/i.test(text)) text = amount.toFixed(20);
  } else {
    text = amount.replace(/[₹,\s]/g, "").replace(/^Rs\.?/i, "");
  }
  const m = DECIMAL.exec(text);
  if (!m) throw new BharatInputError("AMOUNT_INVALID", `Not a valid amount: "${String(amount)}"`);
  const [, minus, whole = "0", frac = ""] = m;
  const fracPadded = `${frac}000`;
  let paise = Number(whole) * 100 + Number(fracPadded.slice(0, 2));
  if (Number(fracPadded[2]) >= 5) paise += 1;
  if (!Number.isSafeInteger(paise)) {
    throw new BharatInputError("AMOUNT_TOO_LARGE", `Amount is too large: "${String(amount)}"`);
  }
  return minus && paise !== 0 ? -paise : paise;
}

/** Integer paise → plain decimal string with 2 places, e.g. 123450 → "1234.50". */
export function paiseToDecimalString(paise: number): string {
  assertPaise(paise);
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Integer paise → rupees as a number (for JSON output). */
export function paiseToRupees(paise: number): number {
  return Number(paiseToDecimalString(paise));
}

export function assertPaise(paise: number): void {
  if (!Number.isSafeInteger(paise)) {
    throw new BharatInputError("PAISE_NOT_INTEGER", `Paise must be a safe integer, got ${paise}`);
  }
}
