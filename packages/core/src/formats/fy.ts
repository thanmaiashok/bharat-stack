import { BharatInputError } from "../errors.js";
import { type CalendarDate, type DateInput, toCalendarDate } from "./date.js";

/** Indian financial year: 1 April to 31 March. */
export interface FinancialYear {
  /** "2026-27" */
  label: string;
  startYear: number;
  /** ISO dates */
  start: string;
  end: string;
}

export interface FYQuarter {
  fy: string;
  quarter: 1 | 2 | 3 | 4;
  /** "Q1" … "Q4" */
  label: string;
  /** Months in the quarter, 1–12 calendar months, e.g. [4, 5, 6]. */
  months: [number, number, number];
}

function fyStartYear(d: CalendarDate): number {
  return d.month >= 4 ? d.year : d.year - 1;
}

function fyLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** fyOf("04-11-2026") → "2026-27"; fyOf("15-03-2026") → "2025-26". */
export function fyOf(date: DateInput): string {
  return fyLabel(fyStartYear(toCalendarDate(date)));
}

/** Accepts "2026-27", "2026-2027", "FY2026-27", or the start year 2026. */
export function parseFY(fy: string | number): FinancialYear {
  let startYear: number;
  if (typeof fy === "number") {
    startYear = fy;
  } else {
    const m = /^(?:FY\s*)?(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/i.exec(fy.trim());
    if (!m)
      throw new BharatInputError(
        "FY_FORMAT",
        `Unrecognised financial year "${fy}". Use e.g. "2026-27".`,
      );
    startYear = Number(m[1]);
    const end = m[2] as string;
    const expected = end.length === 2 ? (startYear + 1) % 100 : startYear + 1;
    if (Number(end) !== expected) {
      throw new BharatInputError(
        "FY_FORMAT",
        `Financial year "${fy}" must span consecutive years.`,
      );
    }
  }
  if (!Number.isInteger(startYear) || startYear < 1900 || startYear > 9998) {
    throw new BharatInputError("FY_FORMAT", `Unrecognised financial year "${fy}".`);
  }
  return {
    label: fyLabel(startYear),
    startYear,
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

/** Quarter within the financial year: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. */
export function quarterOf(date: DateInput): FYQuarter {
  const d = toCalendarDate(date);
  const quarter = (Math.trunc(((d.month + 8) % 12) / 3) + 1) as 1 | 2 | 3 | 4;
  const first = (((quarter - 1) * 3 + 3) % 12) + 1;
  return {
    fy: fyLabel(fyStartYear(d)),
    quarter,
    label: `Q${quarter}`,
    months: [first, first + 1, first + 2],
  };
}

export function isInFY(date: DateInput, fy: string | number): boolean {
  return fyOf(date) === parseFY(fy).label;
}
