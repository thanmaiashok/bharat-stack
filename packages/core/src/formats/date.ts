import { BharatInputError } from "../errors.js";

/** A calendar date with no time zone. month is 1–12. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** Anything we accept as a date. Date objects are read in Indian Standard Time (UTC+05:30). */
export type DateInput = CalendarDate | Date | string;

const IST_OFFSET_MS = 330 * 60 * 1000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const INDIAN = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidCalendarDate(d: CalendarDate): boolean {
  return (
    Number.isInteger(d.year) &&
    Number.isInteger(d.month) &&
    Number.isInteger(d.day) &&
    d.year >= 1900 &&
    d.year <= 9999 &&
    d.month >= 1 &&
    d.month <= 12 &&
    d.day >= 1 &&
    d.day <= daysInMonth(d.year, d.month)
  );
}

function checked(d: CalendarDate, raw: unknown): CalendarDate {
  if (!isValidCalendarDate(d)) {
    throw new BharatInputError("DATE_INVALID", `Not a valid calendar date: ${JSON.stringify(raw)}`);
  }
  return d;
}

/** Calendar date in India for an instant in time. */
export function dateInIST(instant: Date): CalendarDate {
  if (Number.isNaN(instant.getTime())) throw new BharatInputError("DATE_INVALID", "Invalid Date");
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Parse "dd-mm-yyyy", "dd/mm/yyyy", "dd.mm.yyyy" or ISO "yyyy-mm-dd".
 * Day comes first in the Indian style, so "04-11-2026" is 4 November 2026.
 */
export function parseIndianDate(text: string): CalendarDate {
  const s = text.trim();
  const iso = ISO.exec(s);
  if (iso)
    return checked({ year: +(iso[1] ?? 0), month: +(iso[2] ?? 0), day: +(iso[3] ?? 0) }, text);
  const ind = INDIAN.exec(s);
  if (ind)
    return checked({ year: +(ind[3] ?? 0), month: +(ind[2] ?? 0), day: +(ind[1] ?? 0) }, text);
  throw new BharatInputError(
    "DATE_FORMAT",
    `Unrecognised date "${text}". Use dd-mm-yyyy (e.g. 04-11-2026) or yyyy-mm-dd.`,
  );
}

/** Normalise any accepted date input to a validated CalendarDate. */
export function toCalendarDate(input: DateInput): CalendarDate {
  if (input instanceof Date) return dateInIST(input);
  if (typeof input === "string") return parseIndianDate(input);
  return checked({ year: input.year, month: input.month, day: input.day }, input);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** → "04-11-2026" (or with "/" or "." as separator). */
export function formatIndianDate(input: DateInput, separator: "-" | "/" | "." = "-"): string {
  const d = toCalendarDate(input);
  return [pad(d.day), pad(d.month), String(d.year)].join(separator);
}

/** → "2026-11-04". */
export function toISODate(input: DateInput): string {
  const d = toCalendarDate(input);
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** Compare two dates: negative if a < b, 0 if equal, positive if a > b. */
export function compareDates(a: DateInput, b: DateInput): number {
  const x = toCalendarDate(a);
  const y = toCalendarDate(b);
  return x.year - y.year || x.month - y.month || x.day - y.day;
}
