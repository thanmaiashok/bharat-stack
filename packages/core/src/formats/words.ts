import { BharatInputError } from "../errors.js";
import { type Amount, toPaise } from "../money.js";

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n] as string;
  const tens = TENS[Math.trunc(n / 10)] as string;
  const ones = n % 10;
  return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
}

function below1000(n: number): string[] {
  const parts: string[] = [];
  const hundreds = Math.trunc(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) parts.push(below100(rest));
  return parts;
}

function indianWords(n: number): string[] {
  if (n === 0) return [];
  const crore = Math.trunc(n / 10_000_000);
  const rest = n % 10_000_000;
  const parts: string[] = [];
  // Above 99 crore, the crore count itself is spelled in the Indian system ("One Lakh Crore").
  if (crore > 0) parts.push(...indianWords(crore), "Crore");
  const lakh = Math.trunc(rest / 100_000);
  const thousand = Math.trunc((rest % 100_000) / 1000);
  const hundreds = rest % 1000;
  if (lakh > 0) parts.push(below100(lakh), "Lakh");
  if (thousand > 0) parts.push(below100(thousand), "Thousand");
  parts.push(...below1000(hundreds));
  return parts;
}

/** Spell a non-negative whole number in the Indian system: 150000 → "One Lakh Fifty Thousand". */
export function numberToIndianWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new BharatInputError("WORDS_INVALID", `Expected a non-negative whole number, got ${n}`);
  }
  return n === 0 ? "Zero" : indianWords(n).join(" ");
}

/**
 * amountInWords(12345678.5) →
 * "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only"
 */
export function amountInWords(amount: Amount): string {
  return paiseInWords(toPaise(amount));
}

/** Same as amountInWords but takes integer paise. */
export function paiseInWords(paise: number): string {
  if (!Number.isSafeInteger(paise)) {
    throw new BharatInputError("PAISE_NOT_INTEGER", `Paise must be a safe integer, got ${paise}`);
  }
  const prefix = paise < 0 ? "Minus " : "";
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const p = abs % 100;
  if (rupees === 0 && p > 0) return `${prefix}${below100(p)} Paise Only`;
  const rupeeWords = `Rupees ${numberToIndianWords(rupees)}`;
  return p === 0
    ? `${prefix}${rupeeWords} Only`
    : `${prefix}${rupeeWords} and ${below100(p)} Paise Only`;
}
