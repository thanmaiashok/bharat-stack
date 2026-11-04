import rateData from "../data/gst-rates.json" with { type: "json" };
import ruleData from "../data/gst-rules.json" with { type: "json" };
import type { Dataset, Sourced } from "./data-types.js";
import { BharatInputError } from "./errors.js";
import { type DateInput, toISODate } from "./formats/date.js";

export interface GSTRateSlab extends Sourced {
  /** Combined rate in percent, e.g. 18. */
  rate: number;
  /** ISO date */
  effective_from: string;
  /** ISO date, or null if still in force. */
  effective_to: string | null;
  description: string;
}

interface Rule extends Sourced {
  id: string;
  value: number | string;
  description: string;
}

const slabs = (rateData as Dataset<GSTRateSlab>).entries;
const rules = new Map((ruleData as Dataset<Rule>).entries.map((r) => [r.id, r]));

/** GST rate slabs valid on a date (defaults to all slabs ever used). */
export function gstRateSlabs(onDate?: DateInput): GSTRateSlab[] {
  if (onDate === undefined) return [...slabs];
  const d = toISODate(onDate);
  return slabs.filter(
    (s) => s.effective_from <= d && (s.effective_to === null || d <= s.effective_to),
  );
}

export function isValidGSTRate(rate: number, onDate: DateInput): boolean {
  return gstRateSlabs(onDate).some((s) => s.rate === rate);
}

export function gstRule<T extends number | string>(id: string): T {
  const r = rules.get(id);
  if (!r) throw new BharatInputError("RULE_MISSING", `Unknown rule "${id}"`);
  return r.value as T;
}
