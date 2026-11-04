import { type Amount, assertPaise, toPaise } from "../money.js";

export interface FormatINROptions {
  /** Prefix with "₹". Default true. */
  symbol?: boolean;
  /** Decimal places: 2 (default) or 0 (rounds half away from zero to whole rupees). */
  decimals?: 0 | 2;
}

/** Group an integer string the Indian way: 12345678 → "1,23,45,678". */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

/** formatINR(12345678.5) → "₹1,23,45,678.50" (lakh/crore grouping). */
export function formatINR(amount: Amount, options: FormatINROptions = {}): string {
  return formatPaise(toPaise(amount), options);
}

/** Same as formatINR but takes integer paise. */
export function formatPaise(paise: number, options: FormatINROptions = {}): string {
  assertPaise(paise);
  const { symbol = true, decimals = 2 } = options;
  const negative = paise < 0;
  let abs = Math.abs(paise);
  let fraction = "";
  if (decimals === 0) {
    abs = Math.round(abs / 100) * 100;
  } else {
    fraction = `.${String(abs % 100).padStart(2, "0")}`;
  }
  const rupees = groupIndian(String(Math.trunc(abs / 100)));
  const isZero = abs === 0;
  return `${negative && !isZero ? "-" : ""}${symbol ? "₹" : ""}${rupees}${fraction}`;
}
