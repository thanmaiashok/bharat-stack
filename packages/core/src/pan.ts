import type { Issue } from "./errors.js";

export const PAN_ENTITY_TYPES = {
  P: "Individual",
  C: "Company",
  H: "Hindu Undivided Family (HUF)",
  F: "Firm / LLP",
  A: "Association of Persons (AOP)",
  T: "Trust",
  B: "Body of Individuals (BOI)",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government",
} as const;

export type PANEntityCode = keyof typeof PAN_ENTITY_TYPES;

export interface PANEntityType {
  code: PANEntityCode;
  label: string;
}

export interface PANValidation {
  valid: boolean;
  input: string;
  /** Upper-cased, whitespace removed. */
  normalized: string;
  errors: Issue[];
  entityType: PANEntityType | null;
  note: string;
}

const PAN_SHAPE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function panEntityType(code: string): PANEntityType | null {
  const label = PAN_ENTITY_TYPES[code as PANEntityCode];
  return label ? { code: code as PANEntityCode, label } : null;
}

/** Validate PAN structure (AAAAA9999A) and decode the 4th character (holder type). */
export function validatePAN(pan: string): PANValidation {
  const normalized = String(pan).replace(/\s+/g, "").toUpperCase();
  const errors: Issue[] = [];
  let entityType: PANEntityType | null = null;
  if (normalized.length !== 10) {
    errors.push({
      code: "PAN_LENGTH",
      message: `PAN must be 10 characters, got ${normalized.length}.`,
    });
  } else if (!PAN_SHAPE.test(normalized)) {
    errors.push({
      code: "PAN_FORMAT",
      message: "PAN must be 5 letters, 4 digits, 1 letter (e.g. ABCPE1234F).",
    });
  } else {
    entityType = panEntityType(normalized[3] as string);
    if (!entityType) {
      errors.push({
        code: "PAN_ENTITY_TYPE",
        message: `4th character "${normalized[3]}" is not a known PAN holder type (${Object.keys(PAN_ENTITY_TYPES).join(", ")}).`,
      });
    }
  }
  return {
    valid: errors.length === 0,
    input: pan,
    normalized,
    errors,
    entityType,
    note: "Checks structure only; does not confirm the PAN exists or is active.",
  };
}
