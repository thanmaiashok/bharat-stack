/** A machine-readable problem found while validating input. */
export interface Issue {
  code: string;
  message: string;
}

/** Thrown when an input cannot be interpreted at all (as opposed to being invalid). */
export class BharatInputError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BharatInputError";
    this.code = code;
  }
}
