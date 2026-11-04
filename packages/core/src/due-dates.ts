import dueData from "../data/gst-due-dates.json" with { type: "json" };
import type { Dataset, Sourced } from "./data-types.js";
import { TAX_DISCLAIMER } from "./disclaimer.js";
import { BharatInputError, type Issue } from "./errors.js";
import { daysInMonth } from "./formats/date.js";
import { fyOf } from "./formats/fy.js";
import { getState } from "./states.js";

interface DueDateRule extends Sourced {
  id: string;
  form: string;
  scheme: "monthly" | "qrmp";
  applies: "every-month" | "quarter-month-1-2" | "quarter-end";
  dayOfFollowingMonth: number;
  stateCodes?: string[];
  description: string;
}

const rules = (dueData as Dataset<DueDateRule>).entries;

export interface DueDate {
  form: string;
  /** Tax period the return covers, e.g. "2026-10" or "2026-27 Q3". */
  period: string;
  /** ISO date, e.g. "2026-11-11". */
  dueDate: string;
  /** "11-11-2026" */
  dueDateIndian: string;
  description: string;
  source: string;
  verification: "official" | "secondary";
}

export interface DueDatesResult {
  taxPeriod: string;
  scheme: "monthly" | "qrmp";
  dueDates: DueDate[];
  warnings: Issue[];
  disclaimer: string;
}

export interface DueDatesInput {
  /** Tax period month as "YYYY-MM", e.g. "2026-10" for October 2026. */
  period: string;
  /** "monthly" (default) or "qrmp" (quarterly return, monthly payment). */
  scheme?: "monthly" | "qrmp";
  /** GST state code; needed for QRMP GSTR-3B (22nd vs 24th). */
  stateCode?: string;
}

/** Statutory GST return due dates for a tax period. Extensions by notification are not included. */
export function gstReturnDueDates(input: DueDatesInput): DueDatesResult {
  const m = /^(\d{4})-(\d{2})$/.exec(input.period.trim());
  const year = Number(m?.[1]);
  const month = Number(m?.[2]);
  if (!m || month < 1 || month > 12) {
    throw new BharatInputError(
      "PERIOD_FORMAT",
      `Tax period must be "YYYY-MM", got "${input.period}".`,
    );
  }
  const scheme = input.scheme ?? "monthly";
  const warnings: Issue[] = [];
  const isQuarterEnd = month % 3 === 0;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  const quarterLabel = `${fyOf({ year, month, day: 1 })} Q${Math.trunc(((month + 8) % 12) / 3) + 1}`;

  const stateCode = input.stateCode ? input.stateCode.padStart(2, "0") : undefined;
  if (stateCode && !getState(stateCode)) {
    warnings.push({ code: "STATE_UNKNOWN", message: `Unknown state code "${input.stateCode}".` });
  }

  const dueDates: DueDate[] = [];
  for (const r of rules) {
    if (r.scheme !== scheme) continue;
    if (r.applies === "quarter-end" && !isQuarterEnd) continue;
    if (r.applies === "quarter-month-1-2" && isQuarterEnd) continue;
    if (r.stateCodes && !(stateCode && r.stateCodes.includes(stateCode))) continue;
    const day = Math.min(r.dayOfFollowingMonth, daysInMonth(nextYear, nextMonth));
    dueDates.push({
      form: r.form,
      period: r.applies === "quarter-end" ? quarterLabel : `${year}-${pad(month)}`,
      dueDate: `${nextYear}-${pad(nextMonth)}-${pad(day)}`,
      dueDateIndian: `${pad(day)}-${pad(nextMonth)}-${nextYear}`,
      description: r.description,
      source: r.source,
      verification: r.verification,
    });
  }

  if (scheme === "qrmp" && isQuarterEnd && !dueDates.some((d) => d.form === "GSTR-3B")) {
    warnings.push({
      code: "STATE_REQUIRED",
      message:
        "Quarterly GSTR-3B is due on the 22nd or 24th depending on the state; pass a valid stateCode.",
    });
  }
  if (rules.some((r) => r.verification !== "official")) {
    warnings.push({
      code: "DATA_UNVERIFIED",
      message:
        "Some due-date rules are verified only against secondary sources. Check gst.gov.in for extensions.",
    });
  }

  return {
    taxPeriod: `${year}-${pad(month)}`,
    scheme,
    dueDates,
    warnings,
    disclaimer: TAX_DISCLAIMER,
  };
}
