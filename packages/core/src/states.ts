import stateData from "../data/state-codes.json" with { type: "json" };
import type { Dataset, Sourced } from "./data-types.js";

export interface GSTState extends Sourced {
  /** Two-digit GST code, e.g. "29". */
  code: string;
  name: string;
  type: "state" | "ut" | "other";
  /** Old code kept only so historical documents can be read. */
  legacy: boolean;
  /** Whether a GSTIN can start with this code. */
  gstinPrefix: boolean;
  note?: string;
}

const data = stateData as Dataset<GSTState>;
const byCode = new Map(data.entries.map((s) => [s.code, s]));

export const STATE_CODES_VERSION = data.version;

/** Look up a GST state code. Accepts "29", "9" or 29. */
export function getState(code: string | number): GSTState | undefined {
  const key = String(code).trim().padStart(2, "0");
  return byCode.get(key);
}

export function listStates(options: { includeLegacy?: boolean } = {}): GSTState[] {
  return data.entries.filter((s) => options.includeLegacy || !s.legacy);
}

const normaliseName = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z]/g, "");

const ALIASES: Record<string, string> = {
  newdelhi: "07",
  nctofdelhi: "07",
  orissa: "21",
  pondicherry: "34",
  andamanandnicobar: "35",
  jk: "01",
  jandk: "01",
  dnhanddd: "26",
  dnhdd: "26",
  uttaranchal: "05",
};

/** Find a current (non-legacy) state by name, e.g. "Karnataka", "tamil nadu", "J&K". */
export function findStateByName(name: string): GSTState | undefined {
  const n = normaliseName(name);
  if (!n) return undefined;
  const alias = ALIASES[n];
  if (alias) return byCode.get(alias);
  return data.entries.find((s) => !s.legacy && normaliseName(s.name) === n);
}
