import { TAX_DISCLAIMER } from "./disclaimer.js";
import type { Issue } from "./errors.js";
import { BharatInputError } from "./errors.js";
import { type PANEntityCode, type PANEntityType, validatePAN } from "./pan.js";
import { getState } from "./states.js";

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface GSTINValidation {
  valid: boolean;
  input: string;
  normalized: string;
  errors: Issue[];
  /** Unusual but not invalid (e.g. legacy state code, 14th char not "Z"). */
  warnings: Issue[];
  stateCode: string | null;
  stateName: string | null;
  pan: string | null;
  panEntityType: PANEntityType | null;
  /** 13th character: registration number for the same PAN in the same state (1–9, then A–Z). */
  entityNumber: string | null;
  checksum: { expected: string; actual: string } | null;
  note: string;
  disclaimer: string;
}

/**
 * GSTIN check character (15th) for the first 14 characters.
 * Mod-36 scheme: weights alternate 1, 2; each product contributes quotient + remainder by 36.
 */
export function computeGSTINChecksum(first14: string): string {
  const s = first14.toUpperCase();
  if (s.length !== 14) {
    throw new BharatInputError("GSTIN_CHECKSUM_INPUT", "Checksum needs exactly 14 characters.");
  }
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(s[i] as string);
    if (value < 0) {
      throw new BharatInputError(
        "GSTIN_CHECKSUM_INPUT",
        `Invalid character "${s[i]}" at position ${i + 1}.`,
      );
    }
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.trunc(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36] as string;
}

/** Validate a GSTIN: structure, state code, embedded PAN, and the mod-36 checksum. */
export function validateGSTIN(gstin: string): GSTINValidation {
  const normalized = String(gstin).replace(/\s+/g, "").toUpperCase();
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const result: GSTINValidation = {
    valid: false,
    input: gstin,
    normalized,
    errors,
    warnings,
    stateCode: null,
    stateName: null,
    pan: null,
    panEntityType: null,
    entityNumber: null,
    checksum: null,
    note: "Checks format and checksum only; does not confirm the GSTIN is registered or active.",
    disclaimer: TAX_DISCLAIMER,
  };

  if (normalized.length !== 15) {
    errors.push({
      code: "GSTIN_LENGTH",
      message: `GSTIN must be 15 characters, got ${normalized.length}.`,
    });
    return result;
  }
  if (!/^[0-9A-Z]{15}$/.test(normalized)) {
    errors.push({
      code: "GSTIN_CHARSET",
      message: "GSTIN may only contain digits 0-9 and letters A-Z.",
    });
    return result;
  }

  const stateCode = normalized.slice(0, 2);
  const state = getState(stateCode);
  result.stateCode = stateCode;
  if (!/^\d{2}$/.test(stateCode) || !state) {
    errors.push({ code: "GSTIN_STATE", message: `"${stateCode}" is not a GST state code.` });
  } else {
    result.stateName = state.name;
    if (!state.gstinPrefix) {
      errors.push({
        code: "GSTIN_STATE",
        message: `State code ${stateCode} (${state.name}) is not used in GSTINs.`,
      });
    } else if (state.legacy) {
      warnings.push({
        code: "GSTIN_STATE_LEGACY",
        message: `State code ${stateCode} is a legacy code. ${state.note ?? ""}`.trim(),
      });
    }
  }

  const pan = normalized.slice(2, 12);
  const panCheck = validatePAN(pan);
  result.pan = pan;
  result.panEntityType = panCheck.entityType;
  for (const e of panCheck.errors)
    errors.push({ code: `GSTIN_${e.code}`, message: `Characters 3-12 (PAN): ${e.message}` });

  const entityNumber = normalized[12] as string;
  result.entityNumber = entityNumber;
  if (entityNumber === "0") {
    errors.push({
      code: "GSTIN_ENTITY_NUMBER",
      message: "13th character (registration number) cannot be 0.",
    });
  }

  if (normalized[13] !== "Z") {
    warnings.push({
      code: "GSTIN_DEFAULT_CHAR",
      message: `14th character is usually "Z", got "${normalized[13]}". Check the GSTIN carefully.`,
    });
  }

  const expected = computeGSTINChecksum(normalized.slice(0, 14));
  const actual = normalized[14] as string;
  result.checksum = { expected, actual };
  if (expected !== actual) {
    errors.push({
      code: "GSTIN_CHECKSUM",
      message: `Checksum mismatch: last character should be "${expected}", got "${actual}".`,
    });
  }

  result.valid = errors.length === 0;
  return result;
}

/** Small seeded PRNG so fixtures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TestIdOptions {
  /** Same seed → same output. Omit for a random value. */
  seed?: number;
  /** PAN holder type (4th char). Default "C" (company). */
  entityType?: PANEntityCode;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * SYNTHETIC PAN for tests and examples only. It has a valid shape but is randomly generated;
 * never present it as a real person's or company's PAN.
 */
export function generateTestPAN(options: TestIdOptions = {}): string {
  const rand = mulberry32(options.seed ?? Math.floor(Math.random() * 2 ** 32));
  const letter = () => LETTERS[Math.floor(rand() * 26)] as string;
  const digit = () => String(Math.floor(rand() * 10));
  return `${letter()}${letter()}${letter()}${options.entityType ?? "C"}${letter()}${digit()}${digit()}${digit()}${digit()}${letter()}`;
}

/**
 * SYNTHETIC GSTIN with a valid checksum, for tests and examples only.
 * It is randomly generated and is not a registered taxpayer.
 */
export function generateTestGSTIN(
  stateCode: string | number = "29",
  options: TestIdOptions = {},
): string {
  const state = getState(stateCode);
  if (!state?.gstinPrefix) {
    throw new BharatInputError(
      "GSTIN_STATE",
      `"${stateCode}" is not a GST state code usable in a GSTIN.`,
    );
  }
  const first14 = `${state.code}${generateTestPAN(options)}1Z`;
  return first14 + computeGSTINChecksum(first14);
}
