import uqcData from "../data/uqc.json" with { type: "json" };
import type { Dataset, Sourced } from "./data-types.js";

export interface UQC extends Sourced {
  code: string;
  name: string;
}

const codes = new Map((uqcData as Dataset<UQC>).entries.map((u) => [u.code, u]));

const ALIASES: Record<string, string> = {
  NO: "NOS",
  NUM: "NOS",
  NUMBER: "NOS",
  NUMBERS: "NOS",
  PC: "PCS",
  PIECE: "PCS",
  PIECES: "PCS",
  KG: "KGS",
  KILO: "KGS",
  KILOGRAM: "KGS",
  G: "GMS",
  GM: "GMS",
  GRAM: "GMS",
  L: "LTR",
  LT: "LTR",
  LITRE: "LTR",
  LITER: "LTR",
  ML: "MLT",
  M: "MTR",
  METER: "MTR",
  METRE: "MTR",
  CM: "CMS",
  KM: "KME",
  SQFT: "SQF",
  SQMT: "SQM",
  TONNE: "TON",
  MT: "MTS",
  DOZEN: "DOZ",
  PAIR: "PRS",
  PACK: "PAC",
  PKT: "PAC",
  UNIT: "UNT",
  UNITS: "UNT",
};

export function listUQC(): UQC[] {
  return [...codes.values()];
}

/** Map a free-text unit to a GST UQC. Unknown units (e.g. HRS for services) map to OTH. */
export function toUQC(unit: string | null | undefined): { code: string; known: boolean } {
  const u = (unit ?? "").trim().toUpperCase().replace(/[.\s]/g, "");
  if (codes.has(u)) return { code: u, known: true };
  const alias = ALIASES[u];
  if (alias) return { code: alias, known: true };
  return { code: "OTH", known: false };
}
